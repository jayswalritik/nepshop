const nodemailer = require('nodemailer');

// ── Transporter ───────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST,
  port:   Number(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Helpers ───────────────────────────────────────────────
const formatCurrency = (amount) =>
  `Rs ${Number(amount).toLocaleString('en-NP')}`;

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-NP', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

const formatDateTime = (date) =>
  new Date(date).toLocaleString('en-NP', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

// ── Base layout ───────────────────────────────────────────
const layout = (content, preheader = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>NepShop</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:#f97316;border-radius:10px;width:36px;height:36px;text-align:center;vertical-align:middle;">
                          <span style="color:#fff;font-size:20px;font-weight:800;line-height:36px;">N</span>
                        </td>
                        <td style="padding-left:10px;">
                          <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">
                            Nep<span style="color:#f97316;">Shop</span>
                          </span>
                        </td>
                      </tr>
                    </table>
                    <p style="color:#a5b4fc;font-size:12px;margin:6px 0 0;letter-spacing:0.5px;">Nepal's Smart Marketplace</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;border-radius:0;padding:0;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-radius:0 0 12px 12px;padding:24px 40px;border-top:1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <p style="color:#94a3b8;font-size:12px;margin:0 0 6px;">
                      © 2026 NepShop — Nepal's Smart Marketplace
                    </p>
                    <p style="color:#94a3b8;font-size:12px;margin:0 0 6px;">
                      Kathmandu, Bagmati Province, Nepal
                    </p>
                    <p style="margin:0;">
                      <a href="mailto:support@nepshop.com" style="color:#6366f1;font-size:12px;text-decoration:none;">support@nepshop.com</a>
                      &nbsp;·&nbsp;
                      <a href="${process.env.FRONTEND_URL}" style="color:#6366f1;font-size:12px;text-decoration:none;">Visit NepShop</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ── Section components ────────────────────────────────────
const hero = (icon, title, subtitle, badgeText = null, badgeColor = '#6366f1') => `
<div style="padding:36px 40px 24px;text-align:center;border-bottom:1px solid #f1f5f9;">
  <div style="font-size:48px;margin-bottom:16px;line-height:1;">${icon}</div>
  ${badgeText ? `
  <div style="display:inline-block;background:${badgeColor}1a;border:1px solid ${badgeColor}33;border-radius:20px;padding:4px 14px;margin-bottom:14px;">
    <span style="color:${badgeColor};font-size:12px;font-weight:600;">${badgeText}</span>
  </div><br>` : ''}
  <h1 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px;line-height:1.3;">${title}</h1>
  <p style="color:#64748b;font-size:14px;margin:0;line-height:1.6;">${subtitle}</p>
</div>`;

const section = (content) => `
<div style="padding:24px 40px;">${content}</div>`;

const infoBox = (rows, bgColor = '#f8fafc', borderColor = '#e2e8f0') => `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bgColor};border:1px solid ${borderColor};border-radius:10px;margin:16px 0;">
  ${rows.map(([label, value]) => `
  <tr>
    <td style="padding:10px 16px;border-bottom:1px solid ${borderColor};width:45%;">
      <span style="color:#64748b;font-size:13px;">${label}</span>
    </td>
    <td style="padding:10px 16px;border-bottom:1px solid ${borderColor};">
      <span style="color:#0f172a;font-size:13px;font-weight:500;">${value}</span>
    </td>
  </tr>`).join('')}
</table>`;

const orderItemsTable = (items) => `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:16px 0;">
  <tr style="background:#f8fafc;">
    <td colspan="2" style="padding:10px 16px;border-bottom:1px solid #e2e8f0;">
      <span style="color:#374151;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Order Items</span>
    </td>
    <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">
      <span style="color:#374151;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Amount</span>
    </td>
  </tr>
  ${items.map(item => `
  <tr style="border-bottom:1px solid #f1f5f9;">
    <td style="padding:12px 16px;width:52px;">
      <img src="${item.image}" alt="${item.name}" width="48" height="48"
        style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;">
    </td>
    <td style="padding:12px 8px;">
      <p style="color:#0f172a;font-size:13px;font-weight:500;margin:0 0 3px;">${item.name}</p>
      <p style="color:#94a3b8;font-size:12px;margin:0;">Qty: ${item.quantity} × ${formatCurrency(item.price)}</p>
    </td>
    <td style="padding:12px 16px;text-align:right;">
      <span style="color:#0f172a;font-size:13px;font-weight:600;">${formatCurrency(item.price * item.quantity)}</span>
    </td>
  </tr>`).join('')}
</table>`;

const priceSummary = (subtotal, deliveryCharge, total, commissionAmount = null) => `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
  <tr>
    <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Subtotal</span></td>
    <td style="padding:6px 0;text-align:right;"><span style="color:#0f172a;font-size:13px;">${formatCurrency(subtotal)}</span></td>
  </tr>
  <tr>
    <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Delivery charge</span></td>
    <td style="padding:6px 0;text-align:right;">
      <span style="color:${deliveryCharge === 0 ? '#16a34a' : '#0f172a'};font-size:13px;">
        ${deliveryCharge === 0 ? 'FREE' : formatCurrency(deliveryCharge)}
      </span>
    </td>
  </tr>
  ${commissionAmount !== null ? `
  <tr>
    <td style="padding:6px 0;"><span style="color:#64748b;font-size:13px;">Platform commission</span></td>
    <td style="padding:6px 0;text-align:right;"><span style="color:#ef4444;font-size:13px;">- ${formatCurrency(commissionAmount)}</span></td>
  </tr>` : ''}
  <tr>
    <td colspan="2" style="padding:4px 0;border-top:2px solid #e2e8f0;"></td>
  </tr>
  <tr>
    <td style="padding:8px 0;"><span style="color:#0f172a;font-size:15px;font-weight:700;">Total</span></td>
    <td style="padding:8px 0;text-align:right;"><span style="color:#4f46e5;font-size:17px;font-weight:700;">${formatCurrency(total)}</span></td>
  </tr>
</table>`;

const ctaButton = (text, url, color = '#4f46e5') => `
<div style="text-align:center;margin:24px 0 8px;">
  <a href="${url}" style="display:inline-block;background:${color};color:#fff;font-size:14px;font-weight:600;padding:13px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">${text}</a>
</div>`;

const alertBox = (text, type = 'info') => {
  const styles = {
    info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', icon: 'ℹ️' },
    success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', icon: '✅' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', icon: '⚠️' },
    danger:  { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', icon: '❌' },
  };
  const s = styles[type] || styles.info;
  return `
<div style="background:${s.bg};border:1px solid ${s.border};border-radius:8px;padding:14px 16px;margin:16px 0;">
  <p style="color:${s.text};font-size:13px;margin:0;line-height:1.6;">
    <strong>${s.icon}</strong> ${text}
  </p>
</div>`;
};

const divider = () => `<hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;">`;

// ── Send helper ───────────────────────────────────────────
const sendEmail = async ({ to, subject, html, preheader }) => {
  try {
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM,
      to,
      subject,
      html: layout(html, preheader),
    });
    console.log(`✅ Email → ${to} | ${subject}`);
  } catch (err) {
    console.error(`❌ Email failed → ${to} | ${err.message}`);
  }
};

// ═════════════════════════════════════════════════════════
// CUSTOMER EMAILS
// ═════════════════════════════════════════════════════════


// 1. Welcome email
const sendWelcomeEmail = (user) => sendEmail({
  to:        user.email,
  subject:   `Welcome to NepShop, ${user.firstName}! 🎉`,
  preheader: 'Your NepShop account is ready. Start shopping Nepal\'s best marketplace.',
  html: `
    ${hero('🎉', `Welcome to NepShop, ${user.firstName}!`, 'Your account has been created successfully. Start exploring thousands of products from verified sellers across Nepal.', 'Account Active', '#16a34a')}
    ${section(`
      ${infoBox([
        ['Full Name',   `${user.firstName} ${user.lastName}`],
        ['Email',        user.email],
        ['Phone',        user.phone],
        ['Account Type', 'Customer'],
        ['Member Since', formatDate(new Date())],
      ])}
      <p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">
        You now have access to:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${[
          ['🛍️', 'Browse thousands of products', 'From electronics to groceries'],
          ['🛒', 'Easy checkout', 'Cash on delivery, Khalti & eSewa'],
          ['📦', 'Order tracking', 'Real-time updates at every step'],
          ['⭐', 'Reviews & ratings', 'Share your experience'],
        ].map(([icon, title, desc]) => `
        <tr>
          <td style="padding:8px 0;width:40px;vertical-align:top;">
            <span style="font-size:20px;">${icon}</span>
          </td>
          <td style="padding:8px 0;">
            <p style="color:#0f172a;font-size:13px;font-weight:600;margin:0 0 2px;">${title}</p>
            <p style="color:#64748b;font-size:12px;margin:0;">${desc}</p>
          </td>
        </tr>`).join('')}
      </table>
      ${ctaButton('Start Shopping →', process.env.FRONTEND_URL)}
    `)}
  `,
});


// 1b. Email verification link
const sendVerificationEmail = (user, verifyUrl) => sendEmail({
  to:        user.email,
  subject:   'Verify your NepShop email address',
  preheader: 'Confirm your email to activate your NepShop account. This link expires in 24 hours.',
  html: `
    ${hero('📧', 'Verify Your Email', `Welcome ${user.firstName}! Please confirm your email address to activate your NepShop account.`, 'Action Required', '#d97706')}
    ${section(`
      <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 8px;">
        Click the button below to verify your email address and activate your account:
      </p>
      ${ctaButton('Verify Email Address', verifyUrl, '#16a34a')}
      ${alertBox('This verification link expires in <strong>24 hours</strong>. If you did not create a NepShop account, you can safely ignore this email.', 'warning')}
      ${divider()}
      <p style="color:#94a3b8;font-size:12px;margin:0;">
        Or copy this link into your browser:<br>
        <span style="color:#6366f1;word-break:break-all;">${verifyUrl}</span>
      </p>
    `)}
  `,
});


// 2. Password reset
const sendPasswordResetEmail = (user, resetUrl) => sendEmail({
  to:        user.email,
  subject:   'Reset your NepShop password',
  preheader: 'You requested a password reset. This link expires in 15 minutes.',
  html: `
    ${hero('🔐', 'Reset Your Password', 'We received a request to reset your NepShop account password.')}
    ${section(`
      ${alertBox('This link expires in <strong>15 minutes</strong>. If you did not request a password reset, please ignore this email — your password will remain unchanged.', 'warning')}
      <p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0 8px;">
        Click the button below to set a new password:
      </p>
      ${ctaButton('Reset Password', resetUrl)}
      ${divider()}
      <p style="color:#94a3b8;font-size:12px;margin:0;">
        Or copy this link into your browser:<br>
        <span style="color:#6366f1;word-break:break-all;">${resetUrl}</span>
      </p>
    `)}
  `,
});

// 3. Order placed confirmation
const sendOrderPlacedEmail = (user, order) => sendEmail({
  to:        user.email,
  subject:   `Order Placed — #${order._id.toString().slice(-8).toUpperCase()} | NepShop`,
  preheader: `Your order of ${formatCurrency(order.total)} has been placed successfully.`,
  html: `
    ${hero('✅', 'Order Placed Successfully!', `Thank you for your order, ${user.firstName}. We've received your order and it's being reviewed by the seller.`, `Order #${order._id.toString().slice(-8).toUpperCase()}`, '#16a34a')}
    ${section(`
      ${infoBox([
        ['Order ID',       `#${order._id.toString().slice(-8).toUpperCase()}`],
        ['Order Date',      formatDateTime(order.createdAt)],
        ['Payment Method',  order.paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
        ['Payment Status',  order.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Pay on Delivery'],
        ['Order Status',    '⏳ Pending — Awaiting seller confirmation'],
      ])}
      ${orderItemsTable(order.items)}
      ${priceSummary(order.subtotal, order.deliveryCharge, order.total)}
      ${divider()}
      <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 8px;">📍 Delivery Address</p>
      <p style="color:#374151;font-size:13px;line-height:1.8;margin:0;">
        ${order.deliveryAddress.fullName}<br>
        ${order.deliveryAddress.phone}<br>
        ${order.deliveryAddress.street}, ${order.deliveryAddress.city}<br>
        ${order.deliveryAddress.district}
        ${order.deliveryAddress.landmark ? `<br><em style="color:#94a3b8;">Near: ${order.deliveryAddress.landmark}</em>` : ''}
      </p>
      ${order.customerNote ? `
      ${divider()}
      <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 6px;">📝 Your Note</p>
      <p style="color:#64748b;font-size:13px;font-style:italic;margin:0;">"${order.customerNote}"</p>` : ''}
      ${ctaButton('Track Your Order', `${process.env.FRONTEND_URL}/customer/dashboard`)}
      ${alertBox('You will receive another email when the seller confirms your order. For Cash on Delivery orders, please keep the exact amount ready.', 'info')}
    `)}
  `,
});

// 4. Order status update emails
const sendOrderStatusEmail = (user, order, status) => {
  const configs = {
    confirmed: {
      icon:      '✅',
      title:     'Order Confirmed!',
      subtitle:  'Great news! The seller has confirmed your order and is now preparing it.',
      badge:     'Confirmed',
      badgeColor:'#2563eb',
      preheader: 'Your order has been confirmed by the seller.',
      message:   'Your order is being carefully prepared and packed. You\'ll be notified when it\'s ready for dispatch.',
      tip:       null,
    },
    packed: {
      icon:      '📦',
      title:     'Order Packed & Ready!',
      subtitle:  'Your order has been packed and is waiting for the delivery agent.',
      badge:     'Packed',
      badgeColor:'#7c3aed',
      preheader: 'Your order is packed and ready for pickup.',
      message:   'Your package is securely packed and labeled. A delivery agent will be assigned shortly to pick it up.',
      tip:       null,
    },
    dispatched: {
      icon:      '🚚',
      title:     'Order On the Way!',
      subtitle:  'Your order has been picked up and is heading to you.',
      badge:     'Out for Delivery',
      badgeColor:'#d97706',
      preheader: 'Your order is on its way to you right now!',
      message:   'Your delivery agent has picked up your package and is on the way to your address. Please be available to receive it.',
      tip:       'Keep your phone available — the delivery agent may call you before arriving.',
    },
    delivered: {
      icon:      '🎉',
      title:     'Order Delivered!',
      subtitle:  'Your order has been successfully delivered. We hope you love it!',
      badge:     'Delivered',
      badgeColor:'#16a34a',
      preheader: 'Your order has been delivered. Enjoy your purchase!',
      message:   'Thank you for shopping with NepShop! We hope you\'re happy with your purchase. If you have any issues, please contact us within 7 days to request a return.',
      tip:       'Please leave a review to help other shoppers and support the seller.',
    },
    cancelled: {
      icon:      '❌',
      title:     'Order Cancelled',
      subtitle:  'Your order has been cancelled.',
      badge:     'Cancelled',
      badgeColor:'#dc2626',
      preheader: 'Your order has been cancelled.',
      message:   'Your order has been cancelled. If you paid online, a refund will be processed within 3–5 business days to your original payment method.',
      tip:       null,
    },
    returned: {
      icon:      '🔄',
      title:     'Return Request Received',
      subtitle:  'We have received your return request and it is being reviewed.',
      badge:     'Return Requested',
      badgeColor:'#d97706',
      preheader: 'Your return request has been received.',
      message:   'Our team will review your return request within 1–2 business days. You will be notified once a decision is made.',
      tip:       null,
    },
  };

  const c = configs[status];
  if (!c) return;

  return sendEmail({
    to:        user.email,
    subject:   `${c.title} — Order #${order._id.toString().slice(-8).toUpperCase()} | NepShop`,
    preheader: c.preheader,
    html: `
      ${hero(c.icon, c.title, c.subtitle, c.badge, c.badgeColor)}
      ${section(`
        ${infoBox([
          ['Order ID',    `#${order._id.toString().slice(-8).toUpperCase()}`],
          ['Status',      `<strong style="color:${c.badgeColor};">${c.badge}</strong>`],
          ['Updated',      formatDateTime(new Date())],
          ['Total',        formatCurrency(order.total)],
          ['Payment',      order.paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())],
        ])}
        <p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">${c.message}</p>
        ${c.tip ? alertBox(c.tip, 'info') : ''}
        ${status === 'dispatched' && order.deliveryAgent ? `
        ${divider()}
        <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 8px;">🚴 Your Delivery Agent</p>
        ${infoBox([
          ['Agent Name', `${order.deliveryAgent?.firstName || ''} ${order.deliveryAgent?.lastName || ''}`],
          ['Contact',     order.deliveryAgent?.phone || 'Available on call'],
        ], '#eff6ff', '#bfdbfe')}` : ''}
        ${status === 'delivered' ? `
        ${divider()}
        <p style="color:#374151;font-size:14px;font-weight:600;margin:0 0 8px;text-align:center;">How was your experience?</p>
        <p style="color:#64748b;font-size:13px;text-align:center;margin:0 0 16px;">Your review helps other shoppers and supports the seller.</p>
        ${ctaButton('⭐ Write a Review', `${process.env.FRONTEND_URL}/customer/dashboard`)}` : `
        ${ctaButton('View Order Details', `${process.env.FRONTEND_URL}/customer/dashboard`)}`}
        ${status === 'cancelled' ? alertBox('If you have any questions about your cancellation or refund, contact us at <a href="mailto:support@nepshop.com" style="color:#1e40af;">support@nepshop.com</a>', 'warning') : ''}
      `)}
    `,
  });
};

// 5. Payment successful
const sendPaymentSuccessEmail = (user, order) => sendEmail({
  to:        user.email,
  subject:   `Payment Confirmed — ${formatCurrency(order.total)} | NepShop`,
  preheader: `Payment of ${formatCurrency(order.total)} received for order #${order._id.toString().slice(-8).toUpperCase()}.`,
  html: `
    ${hero('💳', 'Payment Successful!', `Your payment of ${formatCurrency(order.total)} has been confirmed.`, 'Payment Received', '#16a34a')}
    ${section(`
      ${infoBox([
        ['Order ID',         `#${order._id.toString().slice(-8).toUpperCase()}`],
        ['Amount Paid',       formatCurrency(order.total)],
        ['Payment Method',    order.paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
        ['Transaction Date',  formatDateTime(new Date())],
        ['Status',            '✅ Confirmed'],
      ], '#f0fdf4', '#bbf7d0')}
      ${ctaButton('View Order', `${process.env.FRONTEND_URL}/customer/dashboard`)}
    `)}
  `,
});

// 6. Return request confirmation to customer
const sendReturnRequestEmail = (user, returnRequest, order) => sendEmail({
  to:        user.email,
  subject:   `Return Request Received — Order #${order._id.toString().slice(-8).toUpperCase()} | NepShop`,
  preheader: 'We have received your return request. Our team will review it within 1–2 business days.',
  html: `
    ${hero('🔄', 'Return Request Received', 'We have received your return request and our team will review it shortly.', 'Under Review', '#d97706')}
    ${section(`
      ${infoBox([
        ['Return ID',    `#${returnRequest._id.toString().slice(-8).toUpperCase()}`],
        ['Order ID',     `#${order._id.toString().slice(-8).toUpperCase()}`],
        ['Reason',        returnRequest.reason],
        ['Refund Amount', formatCurrency(returnRequest.refundAmount)],
        ['Submitted',     formatDateTime(new Date())],
        ['Status',        '⏳ Pending Review'],
      ])}
      ${alertBox('Our team reviews return requests within <strong>1–2 business days</strong>. You will receive an email with the decision. If approved, your refund will be processed within 3–5 business days.', 'info')}
      ${ctaButton('View Return Status', `${process.env.FRONTEND_URL}/customer/dashboard`)}
    `)}
  `,
});

// 7. Return approved — refund initiated
const sendReturnApprovedEmail = (user, returnRequest, order) => sendEmail({
  to:        user.email,
  subject:   `Return Approved — Refund of ${formatCurrency(returnRequest.refundAmount)} Initiated | NepShop`,
  preheader: `Your return has been approved. Refund of ${formatCurrency(returnRequest.refundAmount)} is being processed.`,
  html: `
    ${hero('💚', 'Return Approved!', 'Your return request has been approved and your refund is being processed.', 'Refund Initiated', '#16a34a')}
    ${section(`
      ${infoBox([
        ['Order ID',      `#${order._id.toString().slice(-8).toUpperCase()}`],
        ['Refund Amount',  formatCurrency(returnRequest.refundAmount)],
        ['Refund Method',  (returnRequest.refundMethod || 'original_payment').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
        ['Processing Time','3–5 business days'],
      ], '#f0fdf4', '#bbf7d0')}
      ${returnRequest.adminNote ? alertBox(`Admin note: ${returnRequest.adminNote}`, 'info') : ''}
      ${alertBox('Your refund will be credited to your original payment method within 3–5 business days. If you paid by Cash on Delivery, our team will contact you for bank/wallet details.', 'success')}
      ${ctaButton('View My Orders', `${process.env.FRONTEND_URL}/customer/dashboard`)}
    `)}
  `,
});

// 8. Return rejected
const sendReturnRejectedEmail = (user, returnRequest, order) => sendEmail({
  to:        user.email,
  subject:   `Return Request Update — Order #${order._id.toString().slice(-8).toUpperCase()} | NepShop`,
  preheader: 'An update on your return request.',
  html: `
    ${hero('❌', 'Return Request Declined', 'Unfortunately, we were unable to approve your return request at this time.', 'Not Approved', '#dc2626')}
    ${section(`
      ${infoBox([
        ['Order ID', `#${order._id.toString().slice(-8).toUpperCase()}`],
        ['Decision',  '❌ Declined'],
        ['Reason',    returnRequest.adminNote || 'Does not meet return policy criteria'],
      ])}
      ${alertBox('If you believe this decision is incorrect, please contact our support team at <a href="mailto:support@nepshop.com" style="color:#1e40af;">support@nepshop.com</a> with your order details.', 'warning')}
      ${ctaButton('Contact Support', 'mailto:support@nepshop.com', '#64748b')}
    `)}
  `,
});

// ═════════════════════════════════════════════════════════
// SELLER EMAILS
// ═════════════════════════════════════════════════════════

// 9. Seller application submitted
const sendSellerApplicationEmail = (user) => sendEmail({
  to:        user.email,
  subject:   'Your NepShop Seller Application Has Been Received',
  preheader: 'Thank you for applying to sell on NepShop. Your application is under review.',
  html: `
    ${hero('⏳', 'Application Received!', 'Thank you for applying to become a seller on NepShop. We will review your application shortly.', 'Pending Review', '#d97706')}
    ${section(`
      ${infoBox([
        ['Applicant',   `${user.firstName} ${user.lastName}`],
        ['Shop Name',    user.shopName],
        ['PAN Number',   user.panNumber],
        ['Applied On',   formatDate(new Date())],
        ['Status',       '⏳ Pending Admin Review'],
      ])}
      ${alertBox(`
        <strong>📋 Next Step — Visit NepShop Office</strong><br><br>
        To complete your verification, please visit our office with the following documents:<br><br>
        • Citizenship card (original + photocopy)<br>
        • PAN registration certificate<br>
        • Business registration document<br>
        • Recent passport-size photo<br><br>
        <strong>📍 NepShop Office</strong><br>
        Kathmandu, Bagmati Province, Nepal<br>
        Office hours: Sun – Fri, 10:00 AM – 5:00 PM
      `, 'warning')}
      <p style="color:#64748b;font-size:13px;text-align:center;margin:16px 0 0;">
        You will receive an email notification once our team reviews your application.
      </p>
    `)}
  `,
});

// 10. Seller account approved
const sendAccountApprovedEmail = (user) => sendEmail({
  to:        user.email,
  subject:   `🎉 Congratulations! Your NepShop ${user.role === 'seller' ? 'Seller' : 'Delivery Agent'} Account is Approved`,
  preheader: `Your ${user.role === 'seller' ? 'seller' : 'delivery agent'} account has been approved. You can now start ${user.role === 'seller' ? 'selling' : 'delivering'}.`,
  html: `
    ${hero('🎉', 'Account Approved!', `Congratulations ${user.firstName}! Your ${user.role === 'seller' ? 'seller' : 'delivery agent'} account has been verified and approved.`, 'Active', '#16a34a')}
    ${section(`
      ${infoBox([
        ['Name',    `${user.firstName} ${user.lastName}`],
        ['Email',    user.email],
        ['Role',     user.role === 'seller' ? 'Verified Seller' : 'Delivery Agent'],
        ['Status',   '✅ Active'],
        ['Since',    formatDate(new Date())],
      ], '#f0fdf4', '#bbf7d0')}
      ${user.role === 'seller' ? `
      <p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">
        You can now log in to your seller dashboard to:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${[
          ['📦', 'List your products', 'Add products with photos, pricing, and stock'],
          ['🧾', 'Manage orders', 'Confirm, pack, and dispatch customer orders'],
          ['💰', 'Track earnings', 'Monitor your sales and revenue'],
          ['⭐', 'View reviews', 'See what customers say about your products'],
        ].map(([icon, title, desc]) => `
        <tr>
          <td style="padding:6px 0;width:32px;vertical-align:top;"><span style="font-size:18px;">${icon}</span></td>
          <td style="padding:6px 0;">
            <p style="color:#0f172a;font-size:13px;font-weight:600;margin:0 0 2px;">${title}</p>
            <p style="color:#64748b;font-size:12px;margin:0;">${desc}</p>
          </td>
        </tr>`).join('')}
      </table>` : `
      <p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">
        You can now log in to start accepting delivery assignments and earning money.
      </p>`}
      ${ctaButton(user.role === 'seller' ? 'Go to Seller Dashboard →' : 'Go to Delivery Dashboard →', `${process.env.FRONTEND_URL}/login`)}
    `)}
  `,
});

// 11. Account rejected
const sendAccountRejectedEmail = (user) => sendEmail({
  to:        user.email,
  subject:   'Update on Your NepShop Application',
  preheader: 'An update regarding your NepShop application.',
  html: `
    ${hero('📋', 'Application Update', 'We have reviewed your application and unfortunately we are unable to approve it at this time.', 'Not Approved', '#dc2626')}
    ${section(`
      ${infoBox([
        ['Applicant', `${user.firstName} ${user.lastName}`],
        ['Role',       user.role === 'seller' ? 'Seller' : 'Delivery Agent'],
        ['Status',     '❌ Not Approved'],
      ])}
      ${alertBox(`
        Common reasons for rejection include:<br><br>
        • Incomplete or unclear documents<br>
        • Document details do not match registration<br>
        • Business registration not verified<br><br>
        You may <strong>reapply</strong> after addressing the issues. Visit our office for guidance.
      `, 'warning')}
      <p style="color:#64748b;font-size:13px;line-height:1.7;margin:16px 0;text-align:center;">
        For questions, contact us at <a href="mailto:support@nepshop.com" style="color:#6366f1;">support@nepshop.com</a>
      </p>
      ${ctaButton('Reapply', `${process.env.FRONTEND_URL}/login`, '#64748b')}
    `)}
  `,
});

// 12. New order to seller
const sendNewOrderToSeller = (seller, order) => sendEmail({
  to:        seller.email,
  subject:   `🛍️ New Order Received — #${order._id.toString().slice(-8).toUpperCase()} | NepShop`,
  preheader: `You have a new order worth ${formatCurrency(order.total)}. Please confirm it promptly.`,
  html: `
    ${hero('🛍️', 'New Order Received!', 'A customer has placed an order for your products. Please review and confirm it promptly.', 'Action Required', '#d97706')}
    ${section(`
      ${infoBox([
        ['Order ID',       `#${order._id.toString().slice(-8).toUpperCase()}`],
        ['Order Date',      formatDateTime(order.createdAt)],
        ['Customer',       `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`],
        ['Customer Phone',  order.customer?.phone || '—'],
        ['Payment Method',  order.paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
        ['Payment Status',  order.paymentStatus === 'paid' ? '✅ Paid' : '💵 Cash on Delivery'],
      ])}
      ${orderItemsTable(order.items)}
      ${priceSummary(order.subtotal, order.deliveryCharge, order.total, order.commissionAmount)}
      ${divider()}
      <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 8px;">💚 Your Earnings</p>
      ${infoBox([
        ['Order Total',    formatCurrency(order.total)],
        ['Commission (5%)', `- ${formatCurrency(order.commissionAmount)}`],
        ['Your Earnings',   formatCurrency(order.total - order.commissionAmount)],
      ], '#f0fdf4', '#bbf7d0')}
      ${divider()}
      <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 8px;">📍 Deliver to</p>
      <p style="color:#374151;font-size:13px;line-height:1.8;margin:0;">
        ${order.deliveryAddress.fullName}<br>
        ${order.deliveryAddress.phone}<br>
        ${order.deliveryAddress.street}, ${order.deliveryAddress.city}, ${order.deliveryAddress.district}
      </p>
      ${order.customerNote ? `${divider()}<p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 6px;">📝 Customer Note</p><p style="color:#64748b;font-size:13px;font-style:italic;margin:0;">"${order.customerNote}"</p>` : ''}
      ${alertBox('Please confirm this order within <strong>24 hours</strong>. Unconfirmed orders may be automatically cancelled.', 'warning')}
      ${ctaButton('Manage Order →', `${process.env.FRONTEND_URL}/seller/dashboard`)}
    `)}
  `,
});

// 13. Order cancelled — notify seller
const sendOrderCancelledToSeller = (seller, order) => sendEmail({
  to:        seller.email,
  subject:   `Order Cancelled — #${order._id.toString().slice(-8).toUpperCase()} | NepShop`,
  preheader: 'A customer has cancelled their order. Stock has been automatically restored.',
  html: `
    ${hero('❌', 'Order Cancelled', 'A customer has cancelled their order. The stock has been automatically restored.', 'Cancelled', '#dc2626')}
    ${section(`
      ${infoBox([
        ['Order ID',   `#${order._id.toString().slice(-8).toUpperCase()}`],
        ['Cancelled',   formatDateTime(new Date())],
        ['Total Value', formatCurrency(order.total)],
        ['Status',      '❌ Cancelled'],
      ])}
      ${alertBox('Product stock for all items in this order has been automatically restored to your inventory.', 'info')}
      ${ctaButton('View My Orders', `${process.env.FRONTEND_URL}/seller/dashboard`)}
    `)}
  `,
});

// 14. Order delivered — earnings credited to seller
const sendOrderDeliveredToSeller = (seller, order) => sendEmail({
  to:        seller.email,
  subject:   `🎉 Order Delivered — Earnings of ${formatCurrency(order.total - order.commissionAmount)} Credited | NepShop`,
  preheader: `Order #${order._id.toString().slice(-8).toUpperCase()} delivered. Your earnings have been credited.`,
  html: `
    ${hero('🎉', 'Order Delivered Successfully!', 'Your order has been delivered to the customer. Your earnings have been credited to your account.', 'Delivered', '#16a34a')}
    ${section(`
      ${infoBox([
        ['Order ID',      `#${order._id.toString().slice(-8).toUpperCase()}`],
        ['Delivered On',   formatDateTime(new Date())],
        ['Order Total',    formatCurrency(order.total)],
        ['Commission (5%)',`- ${formatCurrency(order.commissionAmount)}`],
        ['Your Earnings',  formatCurrency(order.total - order.commissionAmount)],
      ], '#f0fdf4', '#bbf7d0')}
      ${alertBox('Your earnings are reflected in your dashboard. You can request a payout from your Earnings tab.', 'success')}
      ${ctaButton('View Earnings →', `${process.env.FRONTEND_URL}/seller/dashboard`)}
    `)}
  `,
});

// 15. Return request — notify seller
const sendReturnRequestToSeller = (seller, returnRequest, order) => sendEmail({
  to:        seller.email,
  subject:   `Return Request — Order #${order._id.toString().slice(-8).toUpperCase()} | NepShop`,
  preheader: 'A customer has raised a return request for one of your orders.',
  html: `
    ${hero('🔄', 'Return Request Raised', 'A customer has raised a return request for one of your orders. Our admin team will review and process it.', 'Return Requested', '#d97706')}
    ${section(`
      ${infoBox([
        ['Order ID',     `#${order._id.toString().slice(-8).toUpperCase()}`],
        ['Customer',     `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`],
        ['Reason',        returnRequest.reason],
        ['Refund Amount', formatCurrency(returnRequest.refundAmount)],
        ['Submitted',     formatDateTime(new Date())],
      ])}
      ${alertBox('Our admin team will review this return request. If approved, the product stock will be restored to your inventory automatically.', 'info')}
      ${ctaButton('View Orders', `${process.env.FRONTEND_URL}/seller/dashboard`)}
    `)}
  `,
});

// 16. Low stock alert
const sendLowStockEmail = (seller, product) => sendEmail({
  to:        seller.email,
  subject:   `⚠️ Low Stock Alert — ${product.name} | NepShop`,
  preheader: `${product.name} is running low on stock. Only ${product.stock} units remaining.`,
  html: `
    ${hero('⚠️', 'Low Stock Alert', 'One of your products is running low on stock. Please restock to avoid missing orders.', 'Action Required', '#d97706')}
    ${section(`
      ${infoBox([
        ['Product',   product.name],
        ['Category',  product.category],
        ['Remaining', `<strong style="color:#dc2626;">${product.stock} units</strong>`],
        ['Status',    product.stock === 0 ? '❌ Out of Stock' : '⚠️ Low Stock'],
      ], '#fffbeb', '#fde68a')}
      ${product.stock === 0
        ? alertBox('This product is now <strong>out of stock</strong>. Customers cannot order it. Please restock immediately.', 'danger')
        : alertBox(`Only <strong>${product.stock} units</strong> remaining. Restock soon to avoid losing sales.`, 'warning')
      }
      ${ctaButton('Update Stock →', `${process.env.FRONTEND_URL}/seller/dashboard`)}
    `)}
  `,
});

// 17. Payout processed
const sendPayoutProcessedEmail = (seller, amount, method) => sendEmail({
  to:        seller.email,
  subject:   `💰 Payout of ${formatCurrency(amount)} Processed | NepShop`,
  preheader: `Your payout of ${formatCurrency(amount)} has been processed via ${method}.`,
  html: `
    ${hero('💰', 'Payout Processed!', 'Your earnings have been transferred to your registered payout account.', 'Payout Sent', '#16a34a')}
    ${section(`
      ${infoBox([
        ['Amount',          formatCurrency(amount)],
        ['Method',          method],
        ['Processed On',    formatDate(new Date())],
        ['Processing Time', '1–3 business days to reflect'],
      ], '#f0fdf4', '#bbf7d0')}
      ${alertBox('If you do not receive the payment within 3 business days, please contact us at <a href="mailto:support@nepshop.com" style="color:#1e40af;">support@nepshop.com</a>', 'info')}
      ${ctaButton('View Earnings', `${process.env.FRONTEND_URL}/seller/dashboard`)}
    `)}
  `,
});

// ═════════════════════════════════════════════════════════
// DELIVERY AGENT EMAILS
// ═════════════════════════════════════════════════════════

// 18. Delivery agent application submitted
const sendDeliveryApplicationEmail = (user) => sendEmail({
  to:        user.email,
  subject:   'Your NepShop Delivery Agent Application Has Been Received',
  preheader: 'Thank you for applying as a delivery agent on NepShop.',
  html: `
    ${hero('⏳', 'Application Received!', 'Thank you for applying as a delivery agent on NepShop. We will review your application shortly.', 'Pending Review', '#d97706')}
    ${section(`
      ${infoBox([
        ['Applicant',  `${user.firstName} ${user.lastName}`],
        ['Vehicle',     user.vehicleType],
        ['Applied On',  formatDate(new Date())],
        ['Status',      '⏳ Pending Admin Review'],
      ])}
      ${alertBox(`
        <strong>📋 Next Step — Visit NepShop Office</strong><br><br>
        Please visit our office with the following documents:<br><br>
        • Citizenship card (original + photocopy)<br>
        • Driving license<br>
        • Vehicle registration document (bluebook)<br>
        • Recent passport-size photo<br><br>
        <strong>📍 NepShop Office</strong><br>
        Kathmandu, Bagmati Province, Nepal<br>
        Office hours: Sun – Fri, 10:00 AM – 5:00 PM
      `, 'warning')}
    `)}
  `,
});

// 19. New delivery assignment
const sendDeliveryAssignedEmail = (agent, order) => sendEmail({
  to:        agent.email,
  subject:   `🚚 New Delivery Assignment — #${order._id.toString().slice(-8).toUpperCase()} | NepShop`,
  preheader: 'You have a new delivery assignment. Check pickup and drop details inside.',
  html: `
    ${hero('🚚', 'New Delivery Assignment!', 'You have been assigned a new delivery. Please review the pickup and drop details below.', 'New Assignment', '#7c3aed')}
    ${section(`
      ${infoBox([
        ['Assignment ID', `#${order._id.toString().slice(-8).toUpperCase()}`],
        ['Assigned On',    formatDateTime(new Date())],
        ['Your Earning',  `<strong style="color:#16a34a;">${formatCurrency(order.deliveryEarning || 50)}</strong>`],
        ['Order Value',    formatCurrency(order.total)],
        ['Payment',        order.paymentMethod === 'cash_on_delivery' ? '💵 Collect Cash on Delivery' : '✅ Already Paid'],
      ])}
      ${divider()}
      <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 10px;">📦 Pickup From (Seller)</p>
      ${infoBox([
        ['Shop Name',    order.pickupAddress?.shopName || 'Contact seller'],
        ['Address',      `${order.pickupAddress?.street || ''}, ${order.pickupAddress?.city || ''}`],
        ['District',     order.pickupAddress?.district || '—'],
        ['Contact',      order.pickupAddress?.phone || 'Contact seller'],
      ], '#eff6ff', '#bfdbfe')}
      ${divider()}
      <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 10px;">📍 Deliver To (Customer)</p>
      ${infoBox([
        ['Full Name',    order.deliveryAddress.fullName],
        ['Phone',        order.deliveryAddress.phone],
        ['Address',      `${order.deliveryAddress.street}, ${order.deliveryAddress.city}`],
        ['District',     order.deliveryAddress.district],
        ['Landmark',     order.deliveryAddress.landmark || '—'],
      ], '#f0fdf4', '#bbf7d0')}
      ${order.paymentMethod === 'cash_on_delivery' ? alertBox(`<strong>💵 Cash on Delivery</strong> — Please collect <strong>${formatCurrency(order.total)}</strong> from the customer upon delivery.`, 'warning') : alertBox('✅ This order has already been paid online. No cash collection needed.', 'success')}
      ${ctaButton('Open in Dashboard →', `${process.env.FRONTEND_URL}/login`)}
    `)}
  `,
});

// ═════════════════════════════════════════════════════════
// ADMIN EMAILS
// ═════════════════════════════════════════════════════════

// 20. New application alert to admin
const sendNewApplicationToAdmin = (adminEmail, user) => sendEmail({
  to:        adminEmail,
  subject:   `📋 New ${user.role === 'seller' ? 'Seller' : 'Delivery Agent'} Application — ${user.firstName} ${user.lastName} | NepShop`,
  preheader: `A new ${user.role} application requires your review.`,
  html: `
    ${hero('📋', 'New Application Received', `A new ${user.role === 'seller' ? 'seller' : 'delivery agent'} has applied and requires your review.`, 'Review Required', '#d97706')}
    ${section(`
      ${infoBox([
        ['Applicant',    `${user.firstName} ${user.lastName}`],
        ['Email',         user.email],
        ['Phone',         user.phone],
        ['Role',          user.role === 'seller' ? 'Seller' : 'Delivery Agent'],
        ['Applied On',    formatDateTime(new Date())],
        ...(user.role === 'seller' ? [
          ['Shop Name',   user.shopName],
          ['PAN Number',  user.panNumber],
        ] : [
          ['Vehicle',     user.vehicleType],
          ['Citizenship', user.citizenshipNumber],
        ]),
      ])}
      ${ctaButton('Review Application →', `${process.env.FRONTEND_URL}/admin/login`)}
    `)}
  `,
});

// 21. Daily admin summary
const sendDailyAdminSummary = async (adminEmail) => {
  const Order   = require('../models/Order');
  const User    = require('../models/User');
  const Product = require('../models/Product');

  const today     = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow  = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const [
    todayOrders,
    todayRevenue,
    todayNewUsers,
    pendingApprovals,
    totalProducts,
  ] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
    Order.aggregate([
      { $match: { status: 'delivered', createdAt: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: null, total: { $sum: '$total' }, commission: { $sum: '$commissionAmount' } } },
    ]),
    User.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
    User.countDocuments({ status: 'pending' }),
    Product.countDocuments({ isActive: true }),
  ]);

  const revenue    = todayRevenue[0]?.total      || 0;
  const commission = todayRevenue[0]?.commission || 0;

  return sendEmail({
    to:        adminEmail,
    subject:   `📊 Daily Summary — ${formatDate(today)} | NepShop`,
    preheader: `Today: ${todayOrders} orders, ${formatCurrency(revenue)} revenue, ${commission > 0 ? formatCurrency(commission) + ' commission' : 'no commission yet'}.`,
    html: `
      ${hero('📊', 'Daily Summary Report', `Here's your NepShop platform summary for ${formatDate(today)}.`)}
      ${section(`
        <p style="color:#374151;font-size:14px;font-weight:600;margin:0 0 12px;">📦 Today's Activity</p>
        ${infoBox([
          ['New Orders Today',    todayOrders.toString()],
          ['Revenue (Delivered)', formatCurrency(revenue)],
          ['Commission Earned',   formatCurrency(commission)],
          ['New Users Joined',    todayNewUsers.toString()],
        ])}
        <p style="color:#374151;font-size:14px;font-weight:600;margin:16px 0 12px;">⚡ Platform Status</p>
        ${infoBox([
          ['Pending Approvals',  pendingApprovals > 0 ? `<strong style="color:#d97706;">${pendingApprovals} need review</strong>` : '✅ None'],
          ['Active Products',     totalProducts.toString()],
        ])}
        ${pendingApprovals > 0 ? alertBox(`<strong>${pendingApprovals} seller/delivery applications</strong> are waiting for your review.`, 'warning') : ''}
        ${ctaButton('Go to Admin Dashboard →', `${process.env.FRONTEND_URL}/admin/login`)}
      `)}
    `,
  });
};


// ═════════════════════════════════════════════════════════
// SETTLEMENT & PAYOUT EMAILS
// ═════════════════════════════════════════════════════════

// Seller — earnings released from escrow (cleared the return window)
const sendSettlementReleasedEmail = (seller, order) => {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  const sellerEarning = (order.subtotal - order.commissionAmount).toFixed(0);
  return sendEmail({
    to:        seller.email,
    subject:   `Earnings cleared for order #${shortId} — Rs ${sellerEarning} available 💰`,
    preheader: `Your earnings for order #${shortId} have cleared the return window and are now available for payout.`,
    html: `
      ${hero('💰', 'Earnings Released', `Your earnings for order #${shortId} have cleared the return window and are now available for payout.`, 'Available', '#16a34a')}
      ${section(`
        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">
          Good news, ${seller.firstName}! The return window for this order has passed with no returns, so your earnings have moved from <strong>pending</strong> to <strong>available</strong>.
        </p>
        ${infoBox([
          ['Order ID',        `#${shortId}`],
          ['Product Revenue', `Rs ${order.subtotal.toLocaleString()}`],
          ['Commission (5%)', `− Rs ${order.commissionAmount.toLocaleString()}`],
          ['Your Earnings',   `Rs ${Number(sellerEarning).toLocaleString()}`],
          ['Status',          'Available for payout'],
        ])}
        <p style="color:#64748b;font-size:13px;line-height:1.6;margin:16px 0 0;">
          This amount is now queued for payout. You'll receive another email once NepShop disburses it to your registered payout method.
        </p>
        ${ctaButton('View Earnings →', `${process.env.FRONTEND_URL}`)}
      `)}
    `,
  });
};



// Delivery agent — earning credited on delivery
const sendDeliveryEarningEmail = (agent, order) => {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  const earning = (order.deliveryEarning || 50).toFixed(0);
  return sendEmail({
    to:        agent.email,
    subject:   `You earned Rs ${earning} for delivering order #${shortId} 🚚`,
    preheader: `Your delivery earning of Rs ${earning} for order #${shortId} has been credited.`,
    html: `
      ${hero('🚚', 'Delivery Earning Credited', `You've earned Rs ${earning} for successfully delivering order #${shortId}.`, 'Credited', '#16a34a')}
      ${section(`
        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">
          Great work, ${agent.firstName}! Your earning for this delivery has been credited immediately. It will be included in your next payout.
        </p>
        ${infoBox([
          ['Order ID',       `#${shortId}`],
          ['Delivery Fee',   `Rs ${Number(earning).toLocaleString()}`],
          ['Delivered On',   formatDate(new Date())],
          ['Status',         'Credited — awaiting payout'],
        ])}
        ${ctaButton('View Earnings →', `${process.env.FRONTEND_URL}`)}
      `)}
    `,
  });
};


// ═════════════════════════════════════════════════════════
// RETURN PICKUP & REVERSAL EMAILS
// ═════════════════════════════════════════════════════════

// Return pickup assigned to delivery agent
const sendReturnPickupAssignedEmail = (agent, returnRequest, order) => {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  return sendEmail({
    to:        agent.email,
    subject:   `🔄 Return Pickup Assigned — Order #${shortId} | NepShop`,
    preheader: `You've been assigned a return pickup. Collect from the customer and deliver to the seller.`,
    html: `
      ${hero('🔄', 'Return Pickup Assigned', 'You have a new return pickup. Collect the item from the customer and deliver it back to the seller.', 'New Return Job', '#7c3aed')}
      ${section(`
        ${infoBox([
          ['Return for Order', `#${shortId}`],
          ['Reason',            returnRequest.reason],
          ['Your Earning',     `<strong style="color:#16a34a;">${formatCurrency(returnRequest.returnAgentEarning || 50)}</strong>`],
          ['Assigned On',       formatDateTime(new Date())],
        ])}
        ${divider()}
        <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 10px;">📦 Collect From (Customer)</p>
        ${infoBox([
          ['Customer', `${returnRequest.customer?.firstName || order.deliveryAddress.fullName}`],
          ['Phone',     order.deliveryAddress.phone],
          ['Address',  `${order.deliveryAddress.street}, ${order.deliveryAddress.city}`],
          ['District',  order.deliveryAddress.district],
        ], '#eff6ff', '#bfdbfe')}
        ${divider()}
        <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 10px;">🏪 Deliver To (Seller)</p>
        ${infoBox([
          ['Shop',     order.pickupAddress?.shopName || 'Seller'],
          ['Address',  `${order.pickupAddress?.street || ''}, ${order.pickupAddress?.city || ''}`],
          ['Contact',   order.pickupAddress?.phone || 'Contact seller'],
        ], '#f0fdf4', '#bbf7d0')}
        ${ctaButton('Open in Dashboard →', `${process.env.FRONTEND_URL}/login`)}
      `)}
    `,
  });
};

// Return picked up — notify customer
const sendReturnPickedUpToCustomer = (customer, order) => {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  return sendEmail({
    to:        customer.email,
    subject:   `Return Collected — Order #${shortId} | NepShop`,
    preheader: `Your return for order #${shortId} has been collected and is on its way back to the seller.`,
    html: `
      ${hero('📦', 'Return Collected', `Our delivery agent has collected your return for order #${shortId}. It's now on its way back to the seller.`, 'Picked Up', '#7c3aed')}
      ${section(`
        ${infoBox([
          ['Order ID',    `#${shortId}`],
          ['Collected On', formatDateTime(new Date())],
          ['Status',       'On the way to seller'],
        ])}
        ${alertBox('Once the item reaches the seller, your refund will be processed automatically. We\'ll email you the moment it\'s done.', 'info')}
        ${ctaButton('Track Return →', `${process.env.FRONTEND_URL}/customer/dashboard`)}
      `)}
    `,
  });
};

// Return picked up — notify seller (item coming back)
const sendReturnPickedUpToSeller = (seller, order) => {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  return sendEmail({
    to:        seller.email,
    subject:   `Returned Item Incoming — Order #${shortId} | NepShop`,
    preheader: `A returned item for order #${shortId} is on its way back to you.`,
    html: `
      ${hero('🔄', 'Returned Item On the Way', `A return for order #${shortId} has been collected from the customer and is being delivered back to you.`, 'Incoming', '#d97706')}
      ${section(`
        ${infoBox([
          ['Order ID',    `#${shortId}`],
          ['Collected On', formatDateTime(new Date())],
          ['Status',       'In transit to your shop'],
        ])}
        ${alertBox('Please be available to receive the returned item. Once you receive it, the settlement for this order will be finalized.', 'info')}
        ${ctaButton('View Orders →', `${process.env.FRONTEND_URL}/seller/dashboard`)}
      `)}
    `,
  });
};


// Return completed — refund processed to customer
const sendRefundProcessedToCustomer = (customer, order, refundAmount, fault) => {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  return sendEmail({
    to:        customer.email,
    subject:   `💚 Refund Processed — ${formatCurrency(refundAmount)} | Order #${shortId}`,
    preheader: `Your refund of ${formatCurrency(refundAmount)} for order #${shortId} has been processed.`,
    html: `
      ${hero('💚', 'Refund Processed!', `Your returned item has reached the seller and your refund of ${formatCurrency(refundAmount)} has been processed.`, 'Refund Complete', '#16a34a')}
      ${section(`
        ${infoBox([
          ['Order ID',      `#${shortId}`],
          ['Refund Amount',  formatCurrency(refundAmount)],
          ['Processed On',   formatDateTime(new Date())],
          ['Status',         '✅ Refund Complete'],
        ], '#f0fdf4', '#bbf7d0')}
        ${fault === 'customer' ? alertBox('As this return was a change-of-mind, the delivery charges were deducted from your refund as per our return policy.', 'info') : alertBox('You have been fully refunded including delivery charges.', 'success')}
        ${alertBox('The refund will reflect in your original payment method within 3–5 business days. For Cash on Delivery orders, our team will contact you for your bank/wallet details.', 'info')}
        ${ctaButton('View My Orders →', `${process.env.FRONTEND_URL}/customer/dashboard`)}
      `)}
    `,
  });
};

// Return completed — notify seller (item received, settlement reversed)
const sendReturnCompletedToSeller = (seller, order, fault) => {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  return sendEmail({
    to:        seller.email,
    subject:   `Return Completed — Order #${shortId} | NepShop`,
    preheader: `The returned item for order #${shortId} has been delivered back to you. Settlement adjusted.`,
    html: `
      ${hero('🔄', 'Return Completed', `The returned item for order #${shortId} has been delivered back to you and the settlement has been adjusted.`, 'Returned', '#dc2626')}
      ${section(`
        ${infoBox([
          ['Order ID',     `#${shortId}`],
          ['Returned On',   formatDateTime(new Date())],
          ['Fault',         fault === 'seller' ? 'Product issue (seller)' : 'Customer changed mind'],
          ['Stock',         '✅ Restored to your inventory'],
        ])}
        ${fault === 'seller'
          ? alertBox('As this return was due to a product issue, the earnings for this order have been reversed and the delivery costs were borne by your account, as per our return policy.', 'warning')
          : alertBox('The earnings for this order have been reversed. The customer bore the delivery costs as this was a change-of-mind return.', 'info')}
        ${alertBox('The product stock has been automatically restored to your inventory.', 'success')}
        ${ctaButton('View Orders →', `${process.env.FRONTEND_URL}/seller/dashboard`)}
      `)}
    `,
  });
};

// Return completed — notify agent of their earning
const sendReturnEarningToAgent = (agent, returnRequest, order) => {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  const earning = returnRequest.returnAgentEarning || 50;
  return sendEmail({
    to:        agent.email,
    subject:   `You earned ${formatCurrency(earning)} for return pickup — Order #${shortId} 🔄`,
    preheader: `Your earning of ${formatCurrency(earning)} for the return pickup has been credited.`,
    html: `
      ${hero('🔄', 'Return Pickup Complete', `You've earned ${formatCurrency(earning)} for completing the return pickup for order #${shortId}.`, 'Credited', '#16a34a')}
      ${section(`
        ${infoBox([
          ['Order ID',     `#${shortId}`],
          ['Return Fee',    formatCurrency(earning)],
          ['Completed On',  formatDateTime(new Date())],
          ['Status',        'Credited — awaiting payout'],
        ], '#f0fdf4', '#bbf7d0')}
        ${ctaButton('View Earnings →', `${process.env.FRONTEND_URL}/login`)}
      `)}
    `,
  });
};

// New return request — alert admin
const sendNewReturnToAdmin = (adminEmail, returnRequest, order) => {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  return sendEmail({
    to:        adminEmail,
    subject:   `🔄 New Return Request — Order #${shortId} | NepShop`,
    preheader: `A customer has requested a return for order #${shortId}. Review and process it.`,
    html: `
      ${hero('🔄', 'New Return Request', `A customer has requested a return for order #${shortId} and it needs your review.`, 'Review Required', '#d97706')}
      ${section(`
        ${infoBox([
          ['Order ID',      `#${shortId}`],
          ['Reason',         returnRequest.reason],
          ['Refund Amount',  formatCurrency(returnRequest.refundAmount)],
          ['Requested On',   formatDateTime(new Date())],
        ])}
        ${returnRequest.description ? alertBox(`Customer note: ${returnRequest.description}`, 'info') : ''}
        ${ctaButton('Review Return →', `${process.env.FRONTEND_URL}/admin/login`)}
      `)}
    `,
  });
};

// Refund processed on cancellation — notify customer
const sendCancelRefundToCustomer = (customer, order) => {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  return sendEmail({
    to:        customer.email,
    subject:   `💚 Refund Processed — ${formatCurrency(order.total)} | Order #${shortId}`,
    preheader: `Your order was cancelled and a refund of ${formatCurrency(order.total)} has been processed.`,
    html: `
      ${hero('💚', 'Refund Processed', `Your order #${shortId} was cancelled and your refund of ${formatCurrency(order.total)} has been processed.`, 'Refund Complete', '#16a34a')}
      ${section(`
        ${infoBox([
          ['Order ID',      `#${shortId}`],
          ['Refund Amount',  formatCurrency(order.total)],
          ['Processed On',   formatDateTime(new Date())],
          ['Status',         '✅ Refund Complete'],
        ], '#f0fdf4', '#bbf7d0')}
        ${alertBox('The refund will reflect in your original payment method within 3–5 business days.', 'info')}
        ${ctaButton('View My Orders →', `${process.env.FRONTEND_URL}/customer/dashboard`)}
      `)}
    `,
  });
};

// ═════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════
module.exports = {
  // Customer
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
  sendPaymentSuccessEmail,
  sendReturnRequestEmail,
  sendReturnApprovedEmail,
  sendReturnRejectedEmail,

  // Seller
  sendSellerApplicationEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendNewOrderToSeller,
  sendOrderCancelledToSeller,
  sendOrderDeliveredToSeller,
  sendReturnRequestToSeller,
  sendLowStockEmail,
  sendPayoutProcessedEmail,

  // Delivery agent
  sendDeliveryApplicationEmail,
  sendDeliveryAssignedEmail,

  // Admin
  sendNewApplicationToAdmin,
  sendDailyAdminSummary,

// Settlement & Payout
  sendSettlementReleasedEmail,
  sendDeliveryEarningEmail,
  sendNewReturnToAdmin,
  sendCancelRefundToCustomer,
  sendReturnPickupAssignedEmail,
  sendReturnPickedUpToCustomer,
  sendReturnPickedUpToSeller,
  sendRefundProcessedToCustomer,
  sendReturnCompletedToSeller,
  sendReturnEarningToAgent,
  
};