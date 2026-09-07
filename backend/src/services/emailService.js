const nodemailer = require('nodemailer');
const env = require('../config/env');

function getTransporter() {
  if (!env.SMTP.user || !env.SMTP.pass) {
    return null;
  }

  const isGmail = env.SMTP.host.includes('gmail') || env.SMTP.user.includes('@gmail.com');
  const smtpPass = (env.SMTP.pass || '').replace(/\s+/g, '');
  const transportOptions = isGmail
    ? {
        service: 'gmail',
        auth: {
          user: env.SMTP.user,
          pass: smtpPass
        }
      }
    : {
        host: env.SMTP.host,
        port: env.SMTP.port,
        secure: env.SMTP.secure,
        auth: {
          user: env.SMTP.user,
          pass: smtpPass
        }
      };

  return nodemailer.createTransport(transportOptions);
}

function generateInvoiceHtml(order, items = [], statusType = 'initiated') {
  const orderNum = order.order_number || `#${order.id}`;
  const customerName = order.customer_name || 'Valued Customer';
  const customerPhone = order.customer_phone || 'N/A';
  const customerAddress = order.pickup_address || 'N/A';
  const totalAmount = Number(order.total_amount || 0).toLocaleString('en-IN');
  const paymentMode = (order.payment_mode || 'cash_on_delivery').toUpperCase().replace(/_/g, ' ');
  const pickupSlot = `${order.pickup_date || ''} (${order.pickup_slot || ''})`.trim();

  let statusBadge = '';
  let statusMessage = '';
  let subjectPrefix = '';

  switch (statusType.toLowerCase()) {
    case 'confirmed':
      subjectPrefix = '✅ Order Confirmed & Booking Invoice';
      statusBadge = '<span style="display:inline-block; padding: 6px 14px; font-weight:700; border-radius:20px; font-size:12px; background:#dcfce7; color:#15803d; border:1px solid #86efac;">ORDER CONFIRMED</span>';
      statusMessage = 'Your order has been confirmed! Our service specialist has been scheduled for your slot.';
      break;
    case 'failed':
    case 'cancelled':
      subjectPrefix = '❌ Order Cancelled / Failed Notice';
      statusBadge = '<span style="display:inline-block; padding: 6px 14px; font-weight:700; border-radius:20px; font-size:12px; background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;">CANCELLED / FAILED</span>';
      statusMessage = 'Your order could not be completed or was cancelled. If amount was deducted, it will be refunded within 3-5 business days.';
      break;
    case 'initiated':
    default:
      subjectPrefix = '⏳ Order Initiated & Estimate Bill';
      statusBadge = '<span style="display:inline-block; padding: 6px 14px; font-weight:700; border-radius:20px; font-size:12px; background:#fef3c7; color:#b45309; border:1px solid #fde68a;">ORDER INITIATED</span>';
      statusMessage = 'Your service request has been received. Our support agent will contact you shortly!';
      break;
  }

  let itemsRows = '';
  if (items && items.length > 0) {
    itemsRows = items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px; font-size: 14px; color: #1e293b;">${idx + 1}. ${item.item_name}</td>
        <td style="padding: 12px; font-size: 14px; color: #64748b; text-align: center;">${item.quantity || 1}</td>
        <td style="padding: 12px; font-size: 14px; color: #64748b; text-align: right;">₹${Number(item.unit_price || 0).toLocaleString('en-IN')}</td>
        <td style="padding: 12px; font-size: 14px; font-weight:600; color: #0f172a; text-align: right;">₹${Number(item.total_price || (item.unit_price * (item.quantity || 1))).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');
  } else {
    itemsRows = `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px; font-size: 14px; color: #1e293b;">${order.service_title || 'Solar Care & Cleaning Service'}</td>
        <td style="padding: 12px; font-size: 14px; color: #64748b; text-align: center;">1</td>
        <td style="padding: 12px; font-size: 14px; color: #64748b; text-align: right;">₹${totalAmount}</td>
        <td style="padding: 12px; font-size: 14px; font-weight:600; color: #0f172a; text-align: right;">₹${totalAmount}</td>
      </tr>
    `;
  }

  return {
    subject: `${subjectPrefix} - SolWash #${orderNum}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
          .container { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
          .header { background: #0f172a; padding: 24px; color: #ffffff; display: flex; justify-content: space-between; align-items: center; }
          .header h1 { margin: 0; font-size: 22px; color: #fbbf24; letter-spacing: 0.5px; }
          .header p { margin: 4px 0 0; font-size: 12px; color: #94a3b8; }
          .content { padding: 24px; }
          .status-banner { margin-bottom: 20px; padding: 14px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #3b82f6; }
          .details-grid { display: table; width: 100%; margin-bottom: 24px; }
          .details-col { display: table-cell; width: 50%; vertical-align: top; }
          .table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          .table th { background: #f1f5f9; padding: 10px 12px; font-size: 12px; text-transform: uppercase; color: #475569; text-align: left; }
          .footer { background: #f8fafc; padding: 18px 24px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div>
              <h1>☀️ SolWash</h1>
              <p>Solar Panel & Rooftop Care Services</p>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 12px; color: #cbd5e1;">INVOICE BILL</span><br>
              <strong style="color: #ffffff; font-size: 15px;">${orderNum}</strong>
            </div>
          </div>

          <div class="content">
            <div style="text-align: right; margin-bottom: 16px;">
              ${statusBadge}
            </div>

            <div class="status-banner">
              <p style="margin: 0; font-size: 14px; color: #1e293b; font-weight: 500;">${statusMessage}</p>
            </div>

            <div class="details-grid">
              <div class="details-col">
                <p style="margin:0 0 4px; font-size:11px; text-transform:uppercase; color:#94a3b8; font-weight:700;">Bill To</p>
                <p style="margin:0; font-size:14px; font-weight:600; color:#0f172a;">${customerName}</p>
                <p style="margin:2px 0 0; font-size:13px; color:#475569;">📞 ${customerPhone}</p>
                <p style="margin:2px 0 0; font-size:13px; color:#475569;">📍 ${customerAddress}</p>
              </div>
              <div class="details-col" style="text-align: right;">
                <p style="margin:0 0 4px; font-size:11px; text-transform:uppercase; color:#94a3b8; font-weight:700;">Service Details</p>
                <p style="margin:0; font-size:13px; color:#475569;"><strong>Date / Slot:</strong> ${pickupSlot || 'To be scheduled'}</p>
                <p style="margin:2px 0 0; font-size:13px; color:#475569;"><strong>Payment:</strong> ${paymentMode}</p>
                <p style="margin:2px 0 0; font-size:13px; color:#475569;"><strong>Status:</strong> ${order.payment_status || 'Pending'}</p>
              </div>
            </div>

            <table class="table">
              <thead>
                <tr>
                  <th>Item / Service</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Rate</th>
                  <th style="text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>

            <div style="margin-top: 20px; padding: 16px 0; border-top: 2px dashed #e2e8f0; text-align: right;">
              <span style="font-size: 14px; color: #64748b; margin-right: 16px;">Total Payable:</span>
              <span style="font-size: 22px; font-weight: 800; color: #0f172a;">₹${totalAmount}</span>
            </div>
          </div>

          <div class="footer">
            <p style="margin: 0 0 4px;">Thank you for partnering with SolWash to keep your solar panels shining bright!</p>
            <p style="margin: 0;">For assistance, reach out at support@solwash.com or call our helpline.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
}

async function sendOrderInvoiceEmail(order, statusType = 'initiated', items = []) {
  try {
    const customerEmail = order.customer_email || order.user_email;
    if (!customerEmail) {
      console.log(`[Email] No customer email available for Order #${order.order_number || order.id}. Skipping email.`);
      return false;
    }

    const { subject, html } = generateInvoiceHtml(order, items, statusType);
    const transporter = getTransporter();

    if (!transporter) {
      console.log(`\n========================================`);
      console.log(`📧 [MOCK EMAIL INVOICE - LOCAL DEV]`);
      console.log(`To: ${customerEmail}`);
      console.log(`Subject: ${subject}`);
      console.log(`Status: ${statusType.toUpperCase()}`);
      console.log(`Total: ₹${order.total_amount}`);
      console.log(`Notice: Configure SMTP in .env for real inbox delivery.`);
      console.log(`========================================\n`);
      return true;
    }

    const senderEmail = env.SMTP.from || `"SolWash Solar Care" <${env.SMTP.user}>`;
    const info = await transporter.sendMail({
      from: senderEmail,
      to: customerEmail,
      subject: subject,
      html: html
    });

    console.log(`[Email] Invoice sent to ${customerEmail} (MessageId: ${info.messageId}) [${statusType}]`);
    return true;
  } catch (err) {
    console.error(`[Email Error] Failed to send invoice to ${order.customer_email}:`, err.message);
    return false;
  }
}

module.exports = {
  sendOrderInvoiceEmail,
  generateInvoiceHtml
};
