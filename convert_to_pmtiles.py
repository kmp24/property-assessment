"""
Convert GeoParquet to PMTiles for efficient vector tile serving.

Requirements:
    pip install geopandas pyarrow tippecanoe

Usage:
    python convert_to_pmtiles.py
"""

import geopandas as gpd
import subprocess
import os
import json

print("📦 Loading parquet file...")
gdf = gpd.read_parquet('/mnt/c/Users/kperham/work/property-assessment/parcels.parquet')


print(f"✓ Loaded {len(gdf):,} parcels")
print(f"✓ CRS: {gdf.crs}")

# Ensure WGS84 (required for web maps)
if gdf.crs != 'EPSG:4326':
    print("→ Converting to EPSG:4326...")
    gdf = gdf.to_crs('EPSG:4326')

# Simplify columns for smaller tiles (keep only what dashboard needs)
columns_to_keep = [
    'Parcel ID',
    'Property Address', 
    'Owner',
    'propertyType',
    'Neighborhood',
    'Style Description',
    'Land Acres',
    'Number of Bedroom',
    'Number of Bathrooms',
    'Zone',
    'Frame Type',
    'Gross Area of Primary Building',
    'Effective Year Built',
    'Pre Year Assessed Total',
    'Assessed Total',
    'geometry'
]

# Filter to only columns that exist
existing_cols = [col for col in columns_to_keep if col in gdf.columns]
gdf_slim = gdf[existing_cols].copy()

print(f"→ Keeping {len(existing_cols)} columns for tiles")

# Save as GeoJSON (intermediate step)
print("→ Exporting to GeoJSON...")
gdf_slim.to_file('parcels_temp.geojson', driver='GeoJSON')

print("→ Creating vector tiles with tippecanoe...")

# tippecanoe command to create PMTiles
# -o: output file
# -Z: minimum zoom
# -z: maximum zoom  
# -l: layer name
# --drop-densest-as-needed: automatically simplify at low zooms
# --extend-zooms-if-still-dropping: ensure all features visible
outpath = '/mnt/c/Users/kperham/work/property-assessment/parcels.pmtiles'
tippecanoe_cmd = [
    'tippecanoe',
    '-o', outpath,
    '-Z', '10',           # Min zoom (town level)
    '-z', '18',           # Max zoom (parcel level)
    '-l', 'parcels',      # Layer name
    '--drop-densest-as-needed',
    '--extend-zooms-if-still-dropping',
    '--force',            # Overwrite if exists
    'parcels_temp.geojson'
]

try:
    result = subprocess.run(tippecanoe_cmd, check=True, capture_output=True, text=True)
    print("✓ PMTiles created successfully!")
    
    # Clean up temp file
    os.remove('parcels_temp.geojson')
    print("✓ Cleaned up temporary files")
    
    # Get file size
    size_mb = os.path.getsize(outpath) / (1024 * 1024)
    print(f"✓ Final PMTiles size: {size_mb:.1f} MB")
    
    print("\n🎉 Done! Deploy these files:")
    print("   - parcels.pmtiles")
    print("   - index.html")
    print("   - app.js")
    
except subprocess.CalledProcessError as e:
    print(f"❌ Error running tippecanoe: {e}")
    print(f"Output: {e.output}")
    print("\nMake sure tippecanoe is installed:")
    print("  macOS: brew install tippecanoe")
    print("  Linux: https://github.com/felt/tippecanoe#installation")
    print("  Windows: Use WSL or Docker")
    
except FileNotFoundError:
    print("❌ tippecanoe not found!")
    print("\nInstall tippecanoe first:")
    print("  macOS: brew install tippecanoe")
    print("  Linux: https://github.com/felt/tippecanoe#installation") 
    print("  Windows: Use WSL or Docker")
