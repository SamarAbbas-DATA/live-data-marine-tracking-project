import time
import uuid
import ast
import signal
import threading
from queue import Queue

import paho.mqtt.client as mqtt
import psycopg2


APP_NAME = "data engineering app"

q = Queue()
stop_event = threading.Event()



def db_sender():

    conn = psycopg2.connect(
        dbname="new1",
        user="postgres",
        password="mypassi123",
        host="localhost",
        port="5432"
    )
    cur = conn.cursor()

    print("DB worker started")

    try:
        while not stop_event.is_set():
            data = q.get(timeout=1)   # 1 sec wait for data, then loop again and check if stop_event is set

            cur.execute(
                """INSERT INTO jsona
                (mmsi,time,sog,cog,navstat,rot,posacc,raim,heading,lon,lat)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    data['MMSI'],
                    data['time'],
                    data['sog'],
                    data['cog'],
                    data['navStat'],
                    data['rot'],
                    data['posAcc'],
                    data['raim'],
                    data['heading'],
                    data['lon'],
                    data['lat'],
                ),
            )

            conn.commit()

    finally:
        print("Closing DB...")
        cur.close()
        conn.close()


def connection(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print("Connected")
        client.subscribe("vessels-v2/+/location")


def message(client, userdata, msg):
    a = msg.payload.decode("utf-8")
    b = a.replace('true', 'True').replace('false', 'False')
    a_dict = ast.literal_eval(b)

    a_dict['MMSI'] = msg.topic[11:20]

    q.put(a_dict)


def shutdown(sig, frame):
    print("\nStopping...")
    stop_event.set()
    client.loop_stop()
    client.disconnect()


signal.signal(signal.SIGINT, shutdown)


threading.Thread(target=db_sender, daemon=False).start()


client_name = f"{APP_NAME}; {uuid.uuid4()}"

client = mqtt.Client(
    callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
    transport="websockets",
    client_id=client_name,
)

client.on_connect = connection
client.on_message = message

client.tls_set()
client.connect("meri.digitraffic.fi", 443)

client.loop_forever()