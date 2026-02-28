import time
import uuid
import paho.mqtt.client as mqtt
import ast
from queue import Queue
import threading
import psycopg2
import json


APP_NAME = "data engineering app"

q = Queue()

conn = psycopg2.connect(
    dbname="new1",
    user="postgres",
    password="mypassi123",
    host="localhost",
    port="5432"
)

cur = conn.cursor()


def connection(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print("Connected")
        client.subscribe("vessels-v2/+/location")
    else:
        print("Failed to connect, return code %d\n", reason_code)

def message(client, userdata, msg):
    # print("TOPIC:", msg.topic)
    # print("MMSI:", msg.topic[11:20])
    print("DATA :", msg.payload.decode("utf-8"))
    a = msg.payload.decode("utf-8")
    # print("type :", type(msg.payload.decode("utf-8")))
    b = a.replace('true', 'True').replace('false', 'False')
    a_dict = ast.literal_eval(b)
    a_dict['MMSI'] = msg.topic[11:20] 
    # print(a_dict)
    q.put(a_dict)

def db_sender():
    while True:
        data = q.get()
        cur.execute(
        """INSERT INTO jsona (mmsi,time,sog, cog, navstat, rot, posacc , raim , heading, lon,lat) 
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (data['MMSI'], data['time'],data['sog'],data['cog'],data['navStat'],data['rot'],data['posAcc'],data['raim'],data['heading'],data['lon'],data['lat'])
        )
        conn.commit()
    



client_name = "{}; {}".format(APP_NAME, str(uuid.uuid4()))

client = mqtt.Client(
    callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
    transport="websockets",
    client_id=client_name,
)

# print(client_name)
client.on_connect = connection
client.on_message = message

client.tls_set()
client.connect("meri.digitraffic.fi", 443)

client.loop_forever()
time.sleep(0.2)
client.loop_stop()

client.disconnect()