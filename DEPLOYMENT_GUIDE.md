# SolWash - Production Deployment & Maintenance Guide

This document records the complete deployment details, server configuration, credentials, and maintenance instructions for SolWash.

---

## 🌐 1. Live Production URLs & SSL

| Component | URL | SSL (HTTPS) | Port (Internal) |
| :--- | :--- | :--- | :--- |
| **Customer Web App** | [https://solwash.in](https://solwash.in) | ✅ Active (Let's Encrypt) | `3001` |
| **Admin Management Dashboard** | [https://admin.solwash.in](https://admin.solwash.in) | ✅ Active (Let's Encrypt) | `3000` |
| **Backend REST API** | [https://api.solwash.in](https://api.solwash.in) | ✅ Active (Let's Encrypt) | `5000` |
| **API Health Check** | [https://api.solwash.in/api/health](https://api.solwash.in/api/health) | ✅ Active | `5000` |

---

## 🛡️ 2. Admin Credentials

- **Admin Login URL:** [https://admin.solwash.in](https://admin.solwash.in)
- **Default Email:** `admin@solwash.com` (or username `admin`)
- **Default Password:** `Admin@123456`

---

## 🤖 3. Telegram Bot & Email Notifications

- **Telegram Bot:** `@solwashcare_bot`
- **Bot Token:** Configured in `backend/.env`
- **Admin Chat ID:** `8710119668` (Receives instant alerts whenever an order is booked)
- **Email SMTP:** Configured with Gmail (`solwashbussiness@gmail.com`) for OTP & notifications.

---

## 🔄 4. How to Update Code in Future

Whenever you make changes locally and push to GitHub:
```bash
# On your local machine:
git add .
git commit -m "update message"
git push origin main
```

To deploy those updates to your VPS server:
```bash
# In your VPS Terminal:
cd /var/www/solwash
git pull
pm2 restart all --update-env
```

---

## ⚙️ 5. VPS Server Management Commands (PM2 & Nginx)

### PM2 Process Manager:
```bash
# Check status of all 3 services
pm2 status

# View live real-time logs
pm2 logs

# View specific service logs
pm2 logs solwash-backend
pm2 logs solwash-admin
pm2 logs solwash-frontend

# Restart all services
pm2 restart all
```

### Nginx Web Server & SSL:
```bash
# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Renew SSL certificate (runs automatically, or manual test)
sudo certbot renew --dry-run
```

---

## 📁 6. GitHub Repository

- **Repository:** [https://github.com/solwashbussiness-droid/solwash](https://github.com/solwashbussiness-droid/solwash)
- **Branch:** `main`
- **Server Path:** `/var/www/solwash`
