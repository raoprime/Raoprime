#!/bin/bash
# ==============================================================================
# Raoprime - Oracle Cloud Always Free Automated Production Deploy Script
# Specs: 4 OCPU, 24 GB RAM, 200 GB SSD, 0ms Cold Start, 24/7/365 Non-Stop
# ==============================================================================

set -e

echo "🚀 [1/5] Updating Ubuntu packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw iptables-persistent nginx

echo "🔓 [2/5] Configuring Oracle Cloud Firewall & IPTables..."
# Oracle Linux/Ubuntu images have default iptables rules blocking non-SSH traffic
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save

# Enable UFW
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw --force enable

echo "🐳 [3/5] Installing Docker & Docker Compose..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    sudo apt install -y docker-compose-plugin
fi

echo "📦 [4/5] Deploying Raoprime Ultra-Low-Latency Container..."
if [ -d "Raoprime" ]; then
    cd Raoprime
    git pull origin main
else
    git clone https://github.com/raoprime/Raoprime.git
    cd Raoprime
fi

sudo docker compose down || true
sudo docker compose up -d --build

echo "⚡ [5/5] Raoprime is RUNNING on Port 3000 with 24GB RAM!"
echo "=========================================================="
echo "🌐 Direct Access: http://$(curl -s ifconfig.me):3000"
echo "🛡️ Admin Desk:   http://$(curl -s ifconfig.me):3000/admin"
echo "=========================================================="
