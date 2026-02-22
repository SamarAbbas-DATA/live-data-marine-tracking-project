Data Management Plan (DMP)
Role Responsibility:  Data & Ingestion / Prediction
1. Data Description & Collection
•	Source: The system collects real-time maritime data from the Digitraffic Marine Traffic API.
•	Protocol: Data is ingested via an MQTT/Websocket stream to ensure "real-time" delivery with minimal delay.
•	Data Points: Collected variables include MMSI (vessel ID), Latitude, Longitude, Speed-Over-Ground (SOG), and Course-Over-Ground (COG).
2. Data Quality & Validation
•	Cleaning: Incoming JSON data is parsed and validated; any messages containing null coordinates or corrupted fields are discarded.
•	Filtering: To ensure visualization quality, the system filters out stationary vessels (where SOG is below 0.5 knots) to prevent clutter on the sea map.
•	Realism: The system specifically utilizes COG (Course-Over-Ground) values as recommended to provide more realistic information regarding vessel movement compared to simple heading.
3. Trajectory Prediction Logic
•	Approach: Predictions are formed using a "Dead Reckoning" algorithm based on current position and historical data trends.
•	Real-time Processing: Prediction results are calculated immediately upon ingestion and stored to allow the web server to visualize them in real-time.
4. Storage & Access
•	Database: Data is persisted in a PostgreSQL database specifically chosen for its ability to handle spatial data.
•	Tables: Real-time positions are stored in ais_positions, while calculated paths are stored in ais_predictions.
•	API Access: The API allows for querying specific vessels and time intervals, with results including the insights gained from your predictions.