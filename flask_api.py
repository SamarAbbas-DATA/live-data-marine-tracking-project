from flask import Flask, jsonify, request
import psycopg2
import psycopg2.extras
import math

app = Flask(__name__)


DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "new1",
    "user": "postgres",
    "password": "mypassi123"
}



TABLE_NAME = "jsona"   



def get_conn():
    return psycopg2.connect(**DB_CONFIG)



def predict_position(lat, lon, sog, cog, minutes):
    if lat is None or lon is None or sog is None or cog is None:
        return None, None

    # distance in nautical miles
    distance_nm = sog * (minutes / 60.0)

    # convert heading to radians
    cog_rad = math.radians(cog)

    # 1 degree lat = 60 nautical miles
    delta_lat = (distance_nm * math.cos(cog_rad)) / 60.0

    cos_lat = math.cos(math.radians(lat))
    if abs(cos_lat) < 1e-12:
        delta_lon = 0.0
    else:
        delta_lon = (distance_nm * math.sin(cog_rad)) / (60.0 * cos_lat)

    predicted_lat = lat + delta_lat
    predicted_lon = lon + delta_lon

    return predicted_lat, predicted_lon



# all columns for latest row per vessel

@app.route("/api/vessels/latest", methods=["GET"])
def vessels_latest():
    query = f"""
        SELECT DISTINCT ON (mmsi)
            id,
            mmsi,
            time,
            sog,
            cog,
            navstat,
            rot,
            posacc,
            raim,
            heading,
            lon,
            lat
        FROM {TABLE_NAME}
        WHERE mmsi IS NOT NULL
        ORDER BY mmsi, time DESC
    """

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cur.execute(query)
        rows = cur.fetchall()
        return jsonify(rows)
    finally:
        cur.close()
        conn.close()



# endpoint with prediction of latitude and longitude 

@app.route("/api/vessels/predictions", methods=["GET"])
def vessels_predictions():
    minutes = request.args.get("minutes", default=10, type=int)

    query = f"""
        SELECT DISTINCT ON (mmsi)
            mmsi,
            lat,
            lon,
            sog,
            cog
        FROM {TABLE_NAME}
        WHERE mmsi IS NOT NULL
          AND lat IS NOT NULL
          AND lon IS NOT NULL
        ORDER BY mmsi, time DESC
    """

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cur.execute(query)
        rows = cur.fetchall()

        result = []
        for row in rows:
            pred_lat, pred_lon = predict_position(
                lat=row["lat"],
                lon=row["lon"],
                sog=row["sog"],
                cog=row["cog"],
                minutes=minutes
            )

            result.append({
                "mmsi": row["mmsi"],
                "lat": row["lat"],
                "lon": row["lon"],
                "sog": row["sog"],
                "cog": row["cog"],
                "predicted_lat": pred_lat,
                "predicted_lon": pred_lon
            })

        return jsonify(result)
    finally:
        cur.close()
        conn.close()



# health check

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)