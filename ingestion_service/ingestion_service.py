import paho.mqtt.client as mqtt
import json

from prediction_engine import predict_position

def on_message(client, userdata, msg):
    payload = json.loads(msg.payload.decode("utf-8"))
    props = payload.get("properties", {})
    coords = payload.get("geometry", {}).get("coordinates", [])

    if coords and props.get("cog") is not None:
        mmsi = props.get("mmsi")
        lat, lon = coords[1], coords[0]
        cog = props.get("cog")
        sog = props.get("sog")

        # 1. Clean data
        entry = {"mmsi": mmsi, "lat": lat, "lon": lon, "cog": cog, "sog": sog}
        
        # 2. Predict 
        # Let's predict where it will be in 20 minutes
        p_lat, p_lon = predict_position(lat, lon, cog, sog, 20)
        
        print(f"SHIP: {mmsi} | NOW: ({lat}, {lon}) | PREDICTED: ({round(p_lat, 4)}, {round(p_lon, 4)})")
        