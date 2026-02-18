# pipeline step 1 , vessel to subscriber 

This document outlines the technical architecture and data flow for the real-time vessel tracking application using the Digitraffic  API.



##  Data Lifecycle: From Sea to Client

The data follows a **(Publish/Subscribe)** model, moving through four distinct stages:

1.  **The Vessel (Source):** Ships at sea broadcast their position via AIS (Automatic Identification System) 
2.  **The Publisher (Digitraffic):** Fintraffic base stations receive these radio signals, convert them into digital JSON payloads, and publish them to their internal message broker.
3.  **The Broker (The Hub):** The server at `meri.digitraffic.fi` acts as the central traffic controller. it receives thousands of updates and routes them only to clients who have asked for them.
4.  **The Client :**  Python script connects to the broker and subscribes to the topic `vessels-v2/+/location`. The broker then pushes matching data to the  app instantly. this topic is for recieving data for all vessel locations 



##  Connection Parameters

The line `client.connect("meri.digitraffic.fi", 443)` defines how we enter the network:

* **Host Name:** `meri.digitraffic.fi` 
    * This is the URL of the **MQTT Broker**.
* **Port:** `443`
   

| Role | Entity |
| :--- | :--- |
| **Publisher** | Digitraffic |
| **Subscriber** |  Python Application (The Client) |
| **Broker** | `meri.digitraffic.fi` |


##  WebSockets vs. Message Queues


### 1. Are we using a WebSocket?
**Yes.** code explicitly sets `transport="websockets"`. 
Instead of using a raw TCP socket (standard MQTT), we wrap the MQTT packets inside a WebSocket frame. 

### 2. Are we using a Message Queue?
**Technically, No.** We are using an **MQTT Message Broker**. 
* In a **Message Queue** (like RabbitMQ), messages are typically stored on a disk until a consumer "pulls" them. 
* In our **MQTT Broker** setup, data is  being "pushed" to us in real-time. If the client is offline, the messages are  dropped. It is a real-time stream, not a stored-and-forwarded queue.



