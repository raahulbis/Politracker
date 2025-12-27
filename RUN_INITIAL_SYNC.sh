#!/bin/bash

# Script to run initial vote sync for all MPs
# This will take a while (30-60 minutes for 370 MPs)
# Run in background: nohup ./RUN_INITIAL_SYNC.sh > sync.log 2>&1 &

echo "Starting initial vote sync for all MPs..."
echo "This will take approximately 30-60 minutes for 370 MPs"
echo "Progress will be logged every 10 MPs"
echo ""

npm run db:sync-latest-votes

echo ""
echo "Initial sync complete!"

