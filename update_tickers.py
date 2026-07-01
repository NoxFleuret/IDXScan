import subprocess
import json
import os

print("=========================================")
print(" IDX Ticker List Downloader")
print("=========================================")
print("\nDownloading latest ticker data from IDX...")

url = "https://www.idx.co.id/primary/StockData/GetSecuritiesStock"

try:
    # Use curl via subprocess to bypass WAF 403 Forbidden blocks
    # which often flag standard Python urllib requests.
    cmd = [
        "curl", "-s",
        "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "-H", "Accept: application/json",
        url
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    content = result.stdout
    data = json.loads(content)
        
    print("Formatting data...")
    
    # Extract the data array if it exists
    arr = data.get('data', data)
    
    # Write to idx_tickers.js for frontend consumption
    output_path = os.path.join(os.path.dirname(__file__), "idx_tickers.js")
    with open(output_path, "w", encoding='utf-8') as f:
        f.write("const IDX_TICKERS = " + json.dumps(arr) + ";\n")
        
    print("\nSUCCESS: Tickers have been successfully updated and saved to 'idx_tickers.js'!")
    print("You can now refresh your dashboard to use the new local data.\n")
    
except Exception as e:
    print(f"\nFailed to fetch or process data: {e}")
