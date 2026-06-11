import React, { useEffect, useState } from "react";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import Sidebar from "../components/Sidebar";

const redIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [35, 35],
});

const blueIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [35, 35],
  className: "hue-rotate-180",
});

export default function Dashboard() {
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropCoords, setDropCoords] = useState(null);
  const [polyline, setPolyline] = useState([]);
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0 });

  const token = localStorage.getItem("token");

  // ---------------- GET USER STATS ----------------
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get("/api/rides/stats", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setStats(res.data);
      } catch (err) {
        console.log("Stats error", err);
      }
    };
    fetchStats();
  }, []);

  // ---------------- GEOCODE PLACE NAME ----------------
  const geocode = async (query) => {
    try {
      const res = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${query}`
      );
      if (res.data.length === 0) return null;
      return {
        lat: parseFloat(res.data[0].lat),
        lng: parseFloat(res.data[0].lon),
      };
    } catch {
      return null;
    }
  };

  // ---------------- AUTO ROUTE FETCH ----------------
  useEffect(() => {
    if (pickupCoords && dropCoords) fetchRoute();
  }, [pickupCoords, dropCoords]);

  const fetchRoute = async () => {
    try {
      const res = await axios.post(
        "/api/rides/route",
        {
          start: pickupCoords,
          end: dropCoords,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setPolyline(res.data.geometry.coordinates);
      setDistance(res.data.distance);
      setDuration(res.data.duration);
    } catch (err) {
      console.log("Route error:", err.response?.status);
    }
  };

  return (
    <div className="flex">
      {/* Sidebar */}
      <Sidebar stats={stats} />

      {/* Main */}
      <div className="ml-64 w-full p-6 bg-gray-100 min-h-screen">

        {/* MAP + FORM GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ---------------- MAP ---------------- */}
          <div className="lg:col-span-2 bg-white shadow rounded-xl overflow-hidden">
            <MapContainer
              center={[20.5937, 78.9629]}
              zoom={5}
              style={{ height: "600px", width: "100%" }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              {pickupCoords && (
                <Marker position={[pickupCoords.lat, pickupCoords.lng]} icon={redIcon} />
              )}
              {dropCoords && (
                <Marker position={[dropCoords.lat, dropCoords.lng]} icon={blueIcon} />
              )}

              {polyline.length > 0 && (
                <Polyline positions={polyline} pathOptions={{ color: "blue", weight: 4 }} />
              )}
            </MapContainer>

            {/* Distance + Duration */}
            {distance && duration && (
              <div className="px-4 py-3 bg-white border-t">
                <p className="text-lg font-semibold">
                  📏 {(distance / 1000).toFixed(2)} km  
                  ⏱ {Math.round(duration / 60)} mins
                </p>
              </div>
            )}
          </div>

          {/* ---------------- FORM ---------------- */}
          <div className="bg-white p-6 rounded-xl shadow space-y-4">
            <div>
              <label className="font-semibold">Pickup</label>
              <input
                className="w-full border p-2 rounded"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                onBlur={async () => setPickupCoords(await geocode(pickup))}
              />
            </div>

            <div>
              <label className="font-semibold">Drop</label>
              <input
                className="w-full border p-2 rounded"
                value={drop}
                onChange={(e) => setDrop(e.target.value)}
                onBlur={async () => setDropCoords(await geocode(drop))}
              />
            </div>

            <button className="w-full bg-green-600 text-white py-3 rounded-lg">
              🚗 Pool My Car
            </button>

            <button className="w-full bg-purple-600 text-white py-3 rounded-lg">
              🔍 Find a Car
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
