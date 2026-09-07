const https = require('https');
const env = require('../config/env');

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramMessage(text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Telegram] Token or Chat ID not configured. Skipping notification.');
    return;
  }

  const postData = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          if (parsed.ok) {
            console.log(`[Telegram] Order notification sent successfully (Message ID: ${parsed.result?.message_id})`);
            resolve(true);
          } else {
            console.error('[Telegram API Error]:', parsed.description);
            resolve(false);
          }
        } catch (e) {
          console.error('[Telegram] Failed to parse response:', e.message);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Telegram Request Error]:', err.message);
      resolve(false);
    });

    req.setTimeout(10000, () => {
      console.error('[Telegram] Request timed out after 10s');
      req.destroy();
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

async function sendOrderNotification(order, items = []) {
  try {
    const orderNum = escapeHtml(order.order_number || `#${order.id}`);
    const name = escapeHtml(order.customer_name || 'Customer');
    const phone = escapeHtml(order.customer_phone || 'N/A');
    const email = escapeHtml(order.customer_email || '');
    const address = escapeHtml(order.pickup_address || 'N/A');
    const service = escapeHtml(order.service_title || 'Solar Panel Cleaning Service');
    const amount = Number(order.total_amount || 0).toLocaleString('en-IN');
    const paymentMode = escapeHtml(order.payment_mode || 'Cash on Delivery');
    const pickupDate = escapeHtml(order.pickup_date || 'N/A');
    const pickupSlot = escapeHtml(order.pickup_slot || 'N/A');
    const notes = escapeHtml(order.notes || '');

    let itemsList = '';
    if (items && items.length > 0) {
      itemsList = '\n<b>📋 Items:</b>\n' + items.map(item => 
        ` • ${escapeHtml(item.item_name)} (x${item.quantity}) - ₹${Number(item.total_price || (item.unit_price * item.quantity)).toLocaleString('en-IN')}`
      ).join('\n');
    }

    const message = [
      `🚀 <b>NEW ORDER RECEIVED!</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `📦 <b>Order ID:</b> <code>${orderNum}</code>`,
      `👤 <b>Customer:</b> ${name}`,
      `📞 <b>Phone:</b> ${phone}`,
      email ? `✉️ <b>Email:</b> ${email}` : null,
      `📍 <b>Address:</b> ${address}`,
      `🛠️ <b>Service:</b> ${service}`,
      itemsList ? itemsList : null,
      `💰 <b>Total Amount:</b> ₹${amount}`,
      `💳 <b>Payment Mode:</b> ${paymentMode}`,
      `📅 <b>Pickup Slot:</b> ${pickupDate} (${pickupSlot})`,
      notes ? `📝 <b>Notes:</b> <i>${notes}</i>` : null,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `🕒 <i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`
    ].filter(Boolean).join('\n');

    return await sendTelegramMessage(message);
  } catch (err) {
    console.error('[Telegram] Error composing order notification:', err.message);
  }
}

module.exports = {
  sendTelegramMessage,
  sendOrderNotification
};
