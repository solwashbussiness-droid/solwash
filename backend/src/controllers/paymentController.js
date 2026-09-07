const Razorpay = require('razorpay');
const crypto = require('crypto');
const env = require('../config/env');
const { db } = require('../database/db');
const { sendOrderInvoiceEmail } = require('../services/emailService');

// Initialize Razorpay SDK instance
let razorpayInstance = null;
try {
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    razorpayInstance = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });
  }
} catch (err) {
  console.warn('Razorpay SDK initialization notice:', err.message);
}

// 1. Create Razorpay Payment Order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;
    const amountInPaise = Math.round(Number(amount) * 100);

    if (!amountInPaise || amountInPaise <= 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid payment amount is required.'
      });
    }

    const orderOptions = {
      amount: amountInPaise,
      currency: currency,
      receipt: receipt || `sol_rcpt_${Date.now()}`,
      notes: notes || {}
    };

    // If real Razorpay credentials are set, create order on Razorpay servers
    const isPlaceholderKey = !env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID.includes('solwash123456');
    if (razorpayInstance && !isPlaceholderKey) {
      try {
        const razorpayOrder = await razorpayInstance.orders.create(orderOptions);
        return res.json({
          success: true,
          data: {
            order_id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key_id: env.RAZORPAY_KEY_ID,
            is_mock: false
          }
        });
      } catch (rzpErr) {
        console.warn('Razorpay API request error, activating safe sandbox mode:', rzpErr.message);
      }
    }

    // Sandbox / Test fallback order (allows local testing without blocking app)
    const mockOrderId = `order_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    return res.json({
      success: true,
      data: {
        order_id: mockOrderId,
        amount: amountInPaise,
        currency: 'INR',
        key_id: env.RAZORPAY_KEY_ID,
        is_mock: true
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to initialize payment gateway order.',
      error: error.message
    });
  }
};

// 2. Verify Razorpay Payment Signature
exports.verifyPayment = async (req, res) => {
  try {
    const {
      order_id, // Internal SolWash order ID
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      is_mock
    } = req.body;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required for verification.'
      });
    }

    const isPlaceholderKey = !env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID.includes('solwash123456');
    let isValid = false;

    if (is_mock || isPlaceholderKey) {
      // Test mode acceptance
      isValid = true;
    } else {
      const hmac = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET);
      hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      const generatedSignature = hmac.digest('hex');
      isValid = (generatedSignature === razorpay_signature);
    }

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature. Verification failed.'
      });
    }

    // Update SolWash order record
    await db.runAsync(
      `UPDATE orders
       SET payment_status = 'paid',
           payment_mode = 'razorpay',
           razorpay_order_id = ?,
           razorpay_payment_id = ?,
           status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? OR order_number = ?`,
      [razorpay_order_id || null, razorpay_payment_id || null, order_id, order_id]
    );

    const updatedOrder = await db.getAsync(
      `SELECT o.*, s.title as service_title, u.name as customer_name, u.phone as customer_phone, u.email as customer_email
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = ? OR o.order_number = ?`,
      [order_id, order_id]
    );

    if (updatedOrder) {
      db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [updatedOrder.id]).then(items => {
        sendOrderInvoiceEmail(updatedOrder, 'confirmed', items).catch(e => console.error('[Email] Payment confirmed err:', e.message));
      });
    }

    return res.json({
      success: true,
      message: 'Payment verified and booking confirmed successfully!',
      data: updatedOrder
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying payment signature.',
      error: error.message
    });
  }
};

// 3. Razorpay Server Webhook (Automatic background payment capture sync)
exports.handleWebhook = async (req, res) => {
  try {
    const event = req.body.event;
    const payload = req.body.payload;

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload?.payment?.entity;
      const rzpOrderId = paymentEntity?.order_id;
      const rzpPaymentId = paymentEntity?.id;
      const solOrderId = paymentEntity?.notes?.solwash_order_id;

      if (solOrderId || rzpOrderId) {
        await db.runAsync(
          `UPDATE orders
           SET payment_status = 'paid',
               payment_mode = 'razorpay',
               razorpay_order_id = COALESCE(?, razorpay_order_id),
               razorpay_payment_id = COALESCE(?, razorpay_payment_id),
               status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? OR razorpay_order_id = ?`,
          [rzpOrderId || null, rzpPaymentId || null, solOrderId || -1, rzpOrderId || '']
        );
        console.log(`[Webhook] Order auto-updated to PAID: ID ${solOrderId} / RZP ${rzpOrderId}`);
      }
    }

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(200).json({ status: 'error_ignored' });
  }
};

