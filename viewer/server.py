#!/usr/bin/env python3
#
# Just a tiny augmentation to Python's built-in
# SimpleHTTPRequestHandler, to serve our data dumps.
#
# Usage: ./server.py [path to data dump directory]
#
# If no path is given, `../data` is used.
#
# This server will return a list of the *.json files in the data dump
# directory if `/data` is requested, or a specific file if
# `/data/[filename without extension]` is requested.

from http.server import SimpleHTTPRequestHandler,HTTPServer
import json
import os
import subprocess
import sys

class ViewerHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/data"):
            self.do_data_get()
        else:
            super().do_GET()

    def do_data_get(self):
        if len(self.path[5:]) > 1:
            if self.path[5:] == "/current":
                self.do_data_current_get()
            else:
                self.do_data_file_get()
        else:
            self.do_data_list_get()

    def do_data_list_get(self):
        file_list = self.list_data_files()
        file_list.append("current")
        response = {
            "data_files": file_list
            }
        response_str = json.dumps(response)

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(response_str.encode('utf-8'))

    def list_data_files(self):
        files = os.listdir(self.server.starlink_data_dir)
        return [ f[:-5] for f in files if f.endswith('.json')]

    def do_data_current_get(self):
        result = subprocess.run(['grpcurl', '-plaintext', '-d', '{\"get_history\":{}}', '192.168.100.1:9200', 'SpaceX.API.Device.Device/Handle'], check=True, stdout=subprocess.PIPE)

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(result.stdout)

    def do_data_file_get(self):
        path = os.path.join(self.server.starlink_data_dir,
                            self.path[(self.path.rindex("/"))+1:] + '.json')
        with open(path, "rb") as f:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.copyfile(f, self.wfile)

class main:
    def __init__(self):
        server = HTTPServer(('', 8000), ViewerHandler)
        server.starlink_data_dir = self.choose_data_dir()
        try:
            print("Listening at http://localhost:8000/")
            server.serve_forever()
        except KeyboardInterrupt:
            print("Shutting down (keyboard interrupt)")

    def choose_data_dir(self):
        if len(sys.argv) > 1:
            return sys.argv[1]
        else:
            return "../data"

if __name__ == '__main__':
    m = main()
