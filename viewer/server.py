#!/usr/bin/env python3
#
# Just a tiny augmentation to Python's built-in
# SimpleHTTPRequestHandler, to serve our data dumps.
#
# Usage: ./server.py [connection name ':' path to data dump directory]
#
# If no name:path is given, `starlink:../data` is used.
#
# This server will return a list of the *.json files in the data dump
# directory if `/<connection name>` is requested, or a specific file
# if `/<connection name>/[filename without extension]` is requested.

from http.server import SimpleHTTPRequestHandler,HTTPServer
import json
import os
import subprocess
import sys

class ViewerHandler(SimpleHTTPRequestHandler):
    def path_parts(self):
        return self.path[1:].split("/")

    def connection_name(self):
        parts = self.path_parts()
        if len(parts) > 1:
            return parts[1]

    def data_dir(self):
        if self.connection_name() in self.server.data_dirs:
            return self.server.data_dirs[self.connection_name()]

    def do_GET(self):
        if self.path.startswith("/data"):
            self.do_data_get()
        else:
            super().do_GET()

    def do_data_get(self):
        parts = self.path_parts()
        if len(parts) == 1 and parts[0] == "data":
            self.do_connection_names_get()
        elif len(parts) == 2:
            self.do_data_list_get()
        elif parts[1] == "starlink" and parts[2] == "current":
            self.do_data_current_get()
        else:
            self.do_data_file_get()

    def do_connection_names_get(self):
        response = {
            "connections": [k for k in self.server.data_dirs.keys()]
            }
        response_str = json.dumps(response)

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(response_str.encode('utf-8'))

    def do_data_list_get(self):
        file_list = self.list_data_files()
        if self.connection_name() == "starlink":
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
        print("Listing files for connection ", self.connection_name(),
              " out of directory ", self.data_dir())
        files = os.listdir(self.data_dir())
        return [ f[:-5] for f in files if f.endswith('.json')]

    def do_data_current_get(self):
        result = subprocess.run(['grpcurl', '-plaintext', '-d', '{\"get_history\":{}}', '192.168.100.1:9200', 'SpaceX.API.Device.Device/Handle'], check=True, stdout=subprocess.PIPE)

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(result.stdout)

    def do_data_file_get(self):
        path = os.path.join(self.data_dir(),
                            self.path[(self.path.rindex("/"))+1:] + '.json')
        with open(path, "rb") as f:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.copyfile(f, self.wfile)

class main:
    def __init__(self):
        server = HTTPServer(('', 8000), ViewerHandler)
        server.data_dirs = self.parse_data_dirs()
        try:
            print("Listening at http://localhost:8000/")
            server.serve_forever()
        except KeyboardInterrupt:
            print("Shutting down (keyboard interrupt)")

    def parse_data_dirs(self):
        if len(sys.argv) > 1:
            dirs = {}
            for a in sys.argv[1:]:
                dirs[a.split(":")[0]] = a.split(":")[1]
            return dirs
        else:
            return {"starlink": "../data"}

    def choose_data_dir(self):
        if len(sys.argv) > 1:
            return sys.argv[1]
        else:
            return "../data"

if __name__ == '__main__':
    m = main()
