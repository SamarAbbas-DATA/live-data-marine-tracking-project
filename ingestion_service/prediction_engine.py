import math

def predict_position(lat, lon, cog, sog_knots, minutes_ahead):
    # sog_knots to km per minute (1 knot = 1.852 km/h)
    km_per_min = (sog_knots * 1.852) / 60
    distance = km_per_min * minutes_ahead
    
    # Earth's radius in km
    R = 6371.0
    
    # Convert degrees to radians
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    bearing = math.radians(cog)
    
    # Calculate new latitude
    new_lat = math.asin(math.sin(lat_rad) * math.cos(distance/R) +
                        math.cos(lat_rad) * math.sin(distance/R) * math.cos(bearing))
    
    # Calculate new longitude
    new_lon = lon_rad + math.atan2(math.sin(bearing) * math.sin(distance/R) * math.cos(lat_rad),
                                   math.cos(distance/R) - math.sin(lat_rad) * math.sin(new_lat))
    
    return math.degrees(new_lat), math.degrees(new_lon)

# Test it: A ship at (60.0, 24.0) going 90 degrees (East) at 15 knots
print(f"Predicted position in 30 mins: {predict_position(60.0, 24.0, 90, 15, 30)}")