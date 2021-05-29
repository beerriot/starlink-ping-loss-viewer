#!/bin/bash

PID_FILE=ping.pid

if [ -e $PID_FILE ]; then
	PING_PID=`cat $PID_FILE`
	ps $PING_PID | grep -q collect-pings.py
	if [ $? -eq 0 ]; then
		# collector is running
		exit 0;
	fi;
fi;

# if we got here, collector is not running
./collect-pings.py > /dev/null &
PING_PID=$!
echo "$PING_PID" > $PID_FILE

