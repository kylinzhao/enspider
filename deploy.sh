#!/bin/bash
set -e

echo ">>> Triggering remote deployment on 81.68.130.75..."
ssh root@81.68.130.75 "cd /root/enspider && bash restart-enspider.sh"
echo ">>> Deployment command sent."
