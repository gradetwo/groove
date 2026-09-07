import os
import json

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT_DIR, "src", "data", "genres")
os.makedirs(OUT_DIR, exist_ok=True)

print("Generator engine loaded. Ready to build genres.")
