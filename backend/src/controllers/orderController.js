const { db } = require('../database/db');
const { sendOrderNotification } = require('../services/telegramService');
const { sendOrderInvoiceEmail } = require('../services/emailService');

// Helper to generate readable order number
const generateOrderNumber = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `SOL-${timestamp}-${random}`;
};

// Customer: Place an order
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      service_id,
      pickup_date,
      pickup_slot,
      delivery_date,
      pickup_address,
      customer_phone,
      latitude,
      longitude,
      notes,
      items, // array of { item_name, quantity, unit_price }
      payment_mode
    } = req.body;

    if (!pickup_date || !pickup_slot || !pickup_address) {
      return res.status(400).json({
        success: false,
        message: 'Pickup date, pickup slot, and address are required.'
      });
    }

    // If customer phone is provided, sync with user profile if missing
    if (customer_phone) {
      try {
        await db.runAsync(
          'UPDATE users SET phone = ? WHERE id = ? AND (phone IS NULL OR phone = "")',
          [customer_phone, userId]
        );
      } catch (e) {
        console.warn('Could not auto-update user profile phone:', e.message);
      }
    }

    const orderNumber = generateOrderNumber();
    let calculatedTotal = 0.0;

    if (Array.isArray(items) && items.length > 0) {
      calculatedTotal = items.reduce((acc, curr) => {
        return acc + (Number(curr.quantity || 1) * Number(curr.unit_price || 0));
      }, 0);
    }

    let validServiceId = null;
    if (service_id) {
      const service = await db.getAsync('SELECT id, base_price FROM services WHERE id = ?', [service_id]);
      if (service) {
        validServiceId = service.id;
        if (!items || items.length === 0) {
          calculatedTotal = service.base_price;
        }
      }
    }

    const orderResult = await db.runAsync(
      `INSERT INTO orders (
        order_number, user_id, service_id, pickup_date, pickup_slot,
        delivery_date, pickup_address, customer_phone, latitude, longitude,
        notes, status, total_amount, payment_status, payment_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'pending', ?)`,
      [
        orderNumber,
        userId,
        validServiceId,
        pickup_date,
        pickup_slot,
        delivery_date || null,
        pickup_address,
        customer_phone || null,
        latitude !== undefined && latitude !== null && !isNaN(Number(latitude)) ? Number(latitude) : null,
        longitude !== undefined && longitude !== null && !isNaN(Number(longitude)) ? Number(longitude) : null,
        notes || '',
        calculatedTotal,
        payment_mode || 'cash_on_delivery'
      ]
    );

    const orderId = orderResult.lastID;

    // Insert items if provided
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const qty = Number(item.quantity || 1);
        const price = Number(item.unit_price || 0);
        await db.runAsync(
          `INSERT INTO order_items (order_id, item_name, quantity, unit_price, total_price)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, item.item_name, qty, price, qty * price]
        );
      }
    }

    const order = await db.getAsync(
      `SELECT o.*, s.title as service_title, u.name as customer_name, u.email as customer_email,
              COALESCE(o.customer_phone, u.phone) as customer_phone
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ?`,
      [orderId]
    );

    const orderItems = await db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    // Dispatch Telegram notification in background without blocking response
    sendOrderNotification(order, orderItems).catch(err => {
      console.error('[Telegram] Background dispatch failed:', err.message);
    });

    // Dispatch Email Invoice (Initiated) in background
    sendOrderInvoiceEmail(order, 'initiated', orderItems).catch(err => {
      console.error('[Email] Background dispatch failed:', err.message);
    });

    return res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      data: {
        ...order,
        items: orderItems
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create order.',
      error: error.message
    });
  }
};

// Customer: Get own orders
exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const orders = await db.allAsync(
      `SELECT o.*, s.title as service_title
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [userId]
    );

    return res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders.',
      error: error.message
    });
  }
};

// Customer or Admin: Get order details by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    const order = await db.getAsync(
      `SELECT o.*, s.title as service_title, u.name as customer_name, u.email as customer_email,
              COALESCE(o.customer_phone, u.phone) as customer_phone
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ? OR o.order_number = ?`,
      [id, id]
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // If customer, cannot view another user's order
    if (role === 'customer' && order.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const items = await db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [order.id]);

    return res.json({
      success: true,
      data: {
        ...order,
        items
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order details.',
      error: error.message
    });
  }
};

// Admin: Get all orders (with optional status filtering)
exports.getAllOrders = async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT o.*, s.title as service_title, u.name as customer_name,
             COALESCE(o.customer_phone, u.phone) as customer_phone,
             u.email as customer_email
      FROM orders o
      LEFT JOIN services s ON o.service_id = s.id
      LEFT JOIN users u ON o.user_id = u.id
    `;
    const params = [];

    if (status) {
      sql += ' WHERE o.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY o.created_at DESC';

    const orders = await db.allAsync(sql, params);

    return res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders.',
      error: error.message
    });
  }
};

// Admin: Update order status & payment status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_status, total_amount, delivery_date } = req.body;

    const existing = await db.getAsync('SELECT * FROM orders WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    await db.runAsync(
      `UPDATE orders
       SET status = COALESCE(?, status),
           payment_status = COALESCE(?, payment_status),
           total_amount = COALESCE(?, total_amount),
           delivery_date = COALESCE(?, delivery_date),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        status || null,
        payment_status || null,
        total_amount !== undefined ? Number(total_amount) : null,
        delivery_date || null,
        id
      ]
    );

    const updated = await db.getAsync(
      `SELECT o.*, s.title as service_title, u.name as customer_name, u.phone as customer_phone, u.email as customer_email
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ?`,
      [id]
    );

    // If status changed to confirmed or cancelled, trigger relevant email invoice
    if (status && status !== existing.status) {
      if (status === 'confirmed') {
        db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [id]).then(items => {
          sendOrderInvoiceEmail(updated, 'confirmed', items).catch(e => console.error('[Email] Confirmed err:', e.message));
        });
      } else if (status === 'cancelled') {
        db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [id]).then(items => {
          sendOrderInvoiceEmail(updated, 'failed', items).catch(e => console.error('[Email] Cancelled err:', e.message));
        });
      }
    }

    return res.json({
      success: true,
      message: 'Order updated successfully.',
      data: updated
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update order status.',
      error: error.message
    });
  }
};

// Customer: Cancel pending order
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await db.getAsync(
      `SELECT o.*, s.title as service_title, u.name as customer_name, u.phone as customer_phone, u.email as customer_email
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ? AND o.user_id = ?`,
      [id, userId]
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled in current status: ${order.status}`
      });
    }

    await db.runAsync('UPDATE orders SET status = "cancelled", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    order.status = 'cancelled';
    db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [id]).then(items => {
      sendOrderInvoiceEmail(order, 'failed', items).catch(e => console.error('[Email] Cancel error:', e.message));
    });

    return res.json({
      success: true,
      message: 'Order cancelled successfully.'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel order.',
      error: error.message
    });
  }
};

// Admin: Permanently delete an order
exports.deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.getAsync('SELECT * FROM orders WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    // Delete associated order items
    await db.runAsync('DELETE FROM order_items WHERE order_id = ?', [id]);
    // Delete the order itself
    await db.runAsync('DELETE FROM orders WHERE id = ?', [id]);

    return res.json({
      success: true,
      message: `Order #${existing.order_number} has been permanently deleted.`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete order.',
      error: error.message
    });
  }
};
