#!/usr/bin/env bash
set -e

echo "=============================================="
echo "🚀 SolWash VPS Auto-Deployment Starting..."
echo "=============================================="

# 1. Update and install prerequisites
echo "📦 Checking and installing dependencies..."
sudo apt-get update -y
command -v node >/dev/null 2>&1 || {
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
}
command -v git >/dev/null 2>&1 || sudo apt-get install -y git
command -v nginx >/dev/null 2>&1 || sudo apt-get install -y nginx
command -v certbot >/dev/null 2>&1 || sudo apt-get install -y certbot python3-certbot-nginx
command -v pm2 >/dev/null 2>&1 || sudo npm install -g pm2

# 2. Download / Clone code
echo "📂 Setting up project directory at /var/www/solwash..."
sudo mkdir -p /var/www
if [ -d "/var/www/solwash/.git" ]; then
    echo "Updating existing repository..."
    cd /var/www/solwash
    sudo git pull origin main
else
    echo "Cloning repository..."
    sudo rm -rf /var/www/solwash
    sudo git clone https://github.com/solwashbussiness-droid/solwash.git /var/www/solwash
fi

sudo chown -R $USER:$USER /var/www/solwash
cd /var/www/solwash

# 3. Install NPM dependencies
echo "📦 Installing backend dependencies..."
cd /var/www/solwash/backend
npm install --omit=dev

echo "📦 Installing admin dependencies..."
cd /var/www/solwash/admin
npm install --omit=dev

# 4. Start PM2 services
echo "⚡ Starting PM2 services..."
cd /var/www/solwash
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# 5. Configure Nginx
echo "🌐 Configuring Nginx reverse proxy..."
sudo tee /etc/nginx/sites-available/solwash > /dev/null << 'NGINX_EOF'
# 1. Customer Website: solwash.in
server {
    listen 80;
    server_name solwash.in www.solwash.in;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# 2. Admin Dashboard: admin.solwash.in
server {
    listen 80;
    server_name admin.solwash.in;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# 3. Backend API: api.solwash.in
server {
    listen 80;
    server_name api.solwash.in;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINX_EOF

sudo ln -sf /etc/nginx/sites-available/solwash /etc/nginx/sites-enabled/solwash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo "=============================================="
echo "✅ SolWash Deployment Completed Successfully!"
echo "🌐 Website:  http://solwash.in"
echo "🛡️ Admin:    http://admin.solwash.in"
echo "⚙️ API:      http://api.solwash.in"
echo "=============================================="
echo "Next: Run SSL command below for HTTPS:"
echo "sudo certbot --nginx -d solwash.in -d admin.solwash.in -d api.solwash.in"
echo "=============================================="
