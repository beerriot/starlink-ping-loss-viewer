#!/usr/bin/python3

from datetime import datetime, timedelta
import subprocess
from time import sleep
import json

PING_TARGET = "8.8.8.8"
PING_IFACE = "eth1"
PINGS_PER_FILE = 3600

def collect_pings():
	start_time = datetime.today()
	results = ping_loop()
	end_time = datetime.today()
	write_results(start_time, end_time, results)

def write_results(start_time, end_time, results):
	filename = end_time.isoformat() + ".json"
	with open(filename, 'w') as f:
		f.write(json.dumps({
			"start_time": start_time.isoformat(),
			"end_time": end_time.isoformat(),
			"ping_returncode": results
			}))

last_ping_time = None
def wait_for_ping_time():
	global last_ping_time
	if last_ping_time:
		delta = datetime.today() - last_ping_time
		if delta.total_seconds() < 1:
			sleep(1 - (delta.microseconds / 1000000))
	last_ping_time = datetime.today()

def ping_loop():
	results = []
	for i in range(PINGS_PER_FILE):
		wait_for_ping_time()
		results.append(do_ping())
	return results

def do_ping():
	command = ["ping", "-c", "1", "-w", "1", "-I", PING_IFACE, PING_TARGET]
	return subprocess.run(command).returncode

while(True):
	collect_pings()

