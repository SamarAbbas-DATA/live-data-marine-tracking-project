import paho.mqtt.client as mqtt
import json
import math

DB_MOCK_STORAGE = []

# --- TRAJECTORY PREDICTION LOGIC ---


def predict_position(lat, lon, cog, sog_knots, minutes_ahead):
    if sog_knots < 0.5:  
        return lat, lon

    km_per_min = (sog_knots * 1.852) / 60
    distance = km_per_min * minutes_ahead
    R = 6371.0

    lat_rad, lon_rad, bearing = map(math.radians, [lat, lon, cog])

    new_lat = math.asin(math.sin(lat_rad) * math.cos(distance/R) +
                        math.cos(lat_rad) * math.sin(distance/R) * math.cos(bearing))
    new_lon = lon_rad + math.atan2(math.sin(bearing) * math.sin(distance/R) * math.cos(lat_rad),
                                   math.cos(distance/R) - math.sin(lat_rad) * math.sin(new_lat))

    return math.degrees(new_lat), math.degrees(new_lon)

# --- DATA INGESTION & CLEANING ---


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        props = payload.get("properties", {})
        coords = payload.get("geometry", {}).get("coordinates", [])

        # Validation: Ensure we have COG and valid coordinates
        if coords and props.get("cog") is not None and props.get("sog") is not None:
            mmsi = props.get("mmsi")
            lat, lon = coords[1], coords[0]
            cog, sog = props["cog"], props["sog"]

            # Prediction for 30 mins ahead
            p_lat, p_lon = predict_position(lat, lon, cog, sog, 30)

            result = {
                "mmsi": mmsi,
                "current_pos": [lat, lon],
                "predicted_pos": [p_lat, p_lon],
                "cog": cog
            }
            print(f"Processed MMSI {mmsi}: Predicting movement via COG {cog}")
            DB_MOCK_STORAGE.append(result)  

    except Exception as e:
        pass  


client = mqtt.Client()
client.on_message = on_message
client.connect("mqtt.digitraffic.fi", 1883, 60)
client.subscribe("v1/global/vessels/+/locations")
client.loop_forever()
