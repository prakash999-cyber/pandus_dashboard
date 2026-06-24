import subprocess
import time
import os

url = "http://localhost:3005"
chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(chrome_path):
    chrome_path = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if not os.path.exists(chrome_path):
    print("Chrome executable not found!")
    exit(1)

# Start Chrome in headless mode with logging enabled
cmd = [
    chrome_path,
    "--headless",
    "--disable-gpu",
    "--enable-logging=stderr",
    "--v=1",
    url
]

print("Launching headless Chrome to hit local server on port 3005...")
proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

# Let it run for 5 seconds
time.sleep(5)

print("Terminating Chrome...")
proc.terminate()
try:
    stdout, stderr = proc.communicate(timeout=3)
    print("STDOUT:")
    print(stdout.decode('utf-8', errors='ignore'))
    print("STDERR:")
    print(stderr.decode('utf-8', errors='ignore'))
except Exception as e:
    proc.kill()
    print("Failed to capture outputs:", e)

print("Chrome test run completed.")
