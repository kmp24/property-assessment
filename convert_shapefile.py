#!/usr/bin/env python3
"""
Shapefile to GeoJSON Converter for Property Assessment Dashboard

This script converts your property shapefile into a GeoJSON file
that the dashboard can read directly.

Requirements:
    pip install geopandas
    
Usage:
    python convert_shapefile.py your_parcels.shp properties.geojson
"""

import sys
import geopandas as gpd
import json

def convert_shapefile(input_shapefile, output_geojson, property_type_field='PropType'):
    """
    Convert shapefile to GeoJSON for the dashboard.
    
    Parameters:
    -----------
    input_shapefile : str
        Path to your .shp file
    output_geojson : str
        Path for output GeoJSON file
    property_type_field : str
        Field name that indicates property type (Residential, Condo, Commercial, Vacant)
    """
    
    print(f"Reading shapefile: {input_shapefile}")
    
    # Read shapefile
    gdf = gpd.read_file(input_shapefile)
    
    print(f"Found {len(gdf)} parcels")
    print(f"Columns: {list(gdf.columns)}")
    
    # Convert to WGS84 (lat/lng) if not already
    if gdf.crs != 'EPSG:4326':
        print(f"Converting from {gdf.crs} to EPSG:4326 (WGS84)")
        gdf = gdf.to_crs('EPSG:4326')
    
    # Calculate centroids for point markers
    print("Calculating centroids for map markers...")
    gdf['centroid'] = gdf.geometry.centroid
    gdf['lat'] = gdf.centroid.y
    gdf['lng'] = gdf.centroid.x
    
    # Property type distribution
    if property_type_field in gdf.columns:
        print("\nProperty Type Distribution:")
        print(gdf[property_type_field].value_counts())
    else:
        print(f"\nWarning: Property type field '{property_type_field}' not found!")
        print("Available fields:", list(gdf.columns))
    
    # Convert to GeoJSON
    print(f"\nWriting GeoJSON to: {output_geojson}")
    gdf.to_file(output_geojson, driver='GeoJSON')
    
    print("✓ Conversion complete!")
    
    # Show sample properties
    print("\nSample property (first row):")
    print(gdf.iloc[0].to_dict())
    
    return gdf

def map_field_names(gdf, field_mapping):
    """
    Rename fields to match what the dashboard expects.
    
    Example field_mapping:
    {
        'PARID': 'parcelId',
        'SITEADDRESS': 'address',
        'OWNERNAME1': 'owner',
        'PROPTYPE': 'propertyType',
        'STYLE': 'designStyle',
        'ACRES': 'acreage',
        'BEDS': 'bedrooms',
        'BATHS': 'bathrooms',
        'SQFT': 'sqft',
        'YEARBUILT': 'yearBuilt',
        'ASSESS2020': 'assessment2020',
        'ASSESS2025': 'assessment2025'
    }
    """
    return gdf.rename(columns=field_mapping)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python convert_shapefile.py input.shp output.geojson [property_type_field]")
        print("\nExample:")
        print("  python convert_shapefile.py parcels.shp properties.geojson PropType")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    type_field = sys.argv[3] if len(sys.argv) > 3 else 'PropType'
    
    # Optional: Define field mapping if your shapefile has different field names
    # Uncomment and modify as needed:
    """
    field_mapping = {
        'PARID': 'parcelId',
        'SITEADDRESS': 'address',
        'OWNERNAME1': 'owner',
        'PROPTYPE': 'propertyType',
        'STYLE': 'designStyle',
        'ACRES': 'acreage',
        'BEDS': 'bedrooms',
        'BATHS': 'bathrooms',
        'SQFT': 'sqft',
        'YEARBUILT': 'yearBuilt',
        'ASSESS2020': 'assessment2020',
        'ASSESS2025': 'assessment2025'
    }
    """
    
    try:
        gdf = convert_shapefile(input_file, output_file, type_field)
        
        # Uncomment to apply field mapping:
        # gdf = map_field_names(gdf, field_mapping)
        # gdf.to_file(output_file, driver='GeoJSON')
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nMake sure you have geopandas installed:")
        print("  pip install geopandas")
        sys.exit(1)