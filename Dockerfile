FROM n8nio/n8n:1.106.3

# Copy our startup script
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

# Set the default command
CMD ["/usr/local/bin/start.sh"]
