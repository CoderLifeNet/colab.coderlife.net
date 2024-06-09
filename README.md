# Collaborative Code Review Tool

## Description
A real-time collaborative code review tool with room-based text editing, syntax highlighting, and secure ephemeral sessions. Easily create, join, and manage rooms with custom names and live cursor tracking.

## Features
- Real-time collaborative text editing
- Room-based sessions with custom names
- Syntax highlighting for code
- Live cursor tracking
- Secure and ephemeral sessions

## Getting Started

### Prerequisites
- Node.js
- npm (Node Package Manager)
- Nginx
- Ubuntu 22.04

### Installation

1. **Clone the repository:**
```sh
   git clone https://github.com/yourusername/blankpage.org.git
   cd blankpage.org
```

2. **Install Dependencies:**
```sh
    npm install
```

3. **Start the server:**
```sh
    node server.js
```

### Configure Nginx

1. Install Nginx
```sh
sudo apt update
sudo apt install nginx
```

2. Configure Nginx:
Edit the Nginx configuration file to set up a reverse proxy for the Node.js server.
```sh
sudo nano /etc/nginx/sites-available/default
```
Add the following configuration:
```nginx
server {
    listen 80;

    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. Restart Nginx:
```sh
sudo systemctl restart nginx
```

## Usage
Access the application:
Open your browser and go to http://yourdomain.com

## Create or Join a Room:
Use the interface to create a new room or join an existing one by entering the room ID.

## License
This project is licensed under the Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0) License.

### You are free to:

- Share — copy and redistribute the material in any medium or format
- Adapt — remix, transform, and build upon the material

Under the following terms:

- Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
- NonCommercial — You may not use the material for commercial purposes.
-  ShareAlike — If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.
For more details, visit Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.

## Contributing
We welcome contributions! Please fork this repository and submit pull requests to collaborate on improving this project.

## Contact
Authored by Christopher Hacia. Feel free to reach out for collaboration opportunities!

