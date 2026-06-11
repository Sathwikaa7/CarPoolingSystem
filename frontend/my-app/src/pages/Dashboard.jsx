import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import LiveSearch from "../components/LiveSearch";

import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom icons for pickup and drop
const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const dropIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const availableRideIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Fix marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Auto fit map to route
function FitRoute({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length) map.fitBounds(coords);
  }, [coords, map]);
  return null;
}

// Location Autocomplete Component
function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (value && value.length >= 2) {
        searchPlaces(value);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value]);

  const searchPlaces = async (query) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&limit=5&addressdetails=1&countrycodes=in`,
        {
          headers: {
            'User-Agent': 'CarpoolingApp/1.0 (contact@example.com)',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        const formattedSuggestions = data.map(item => ({
          display_name: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          address: item.address
        }));
        setSuggestions(formattedSuggestions);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    onChange(suggestion.display_name);
    onSelect({
      lat: suggestion.lat,
      lng: suggestion.lng,
      address: suggestion.display_name
    });
    setShowSuggestions(false);
    setSuggestions([]);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${className} ${isLoading ? 'pr-8' : ''}`}
        onFocus={() => {
          if (suggestions.length > 0) {
            setShowSuggestions(true);
          }
        }}
      />

      {isLoading && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <div className="font-medium text-gray-900 text-sm">
                {suggestion.address?.road || suggestion.address?.suburb || 'Location'}
              </div>
              <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                {suggestion.display_name}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Enhanced Ride Match Card Component
function RideMatchCard({ ride, distance, onConnect, onDismiss }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-gradient-to-r from-green-400 to-blue-500 p-1 rounded-lg shadow-lg animate-pulse">
      <div className="bg-white rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
              {ride.user?.name?.charAt(0) || 'D'}
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">
                {ride.user?.name || 'Driver'}
              </h3>
              <p className="text-sm text-gray-600">
                🚗 Pooling Car • {distance} km away
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              {isExpanded ? 'Less' : 'Details'}
            </button>
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-700">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
            <span className="font-medium">From:</span>
            <span className="ml-1">{ride.pickup}</span>
          </div>
          <div className="flex items-center text-sm text-gray-700">
            <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
            <span className="font-medium">To:</span>
            <span className="ml-1">{ride.drop}</span>
          </div>
          <div className="flex items-center text-sm text-gray-700">
            <span className="mr-2">🕒</span>
            <span className="font-medium">Time:</span>
            <span className="ml-1">
              {new Date(ride.dateTime).toLocaleString()}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
            <div className="flex items-center text-sm text-gray-600">
              <span className="mr-2">📱</span>
              <span>Contact: {ride.user?.email || 'Available after connection'}</span>
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <span className="mr-2">⭐</span>
              <span>Rating: 4.8/5 (23 rides)</span>
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <span className="mr-2">💺</span>
              <span>Available seats: 3</span>
            </div>
          </div>
        )}

        <div className="mt-4 flex space-x-2">
          <button
            onClick={() => onConnect(ride)}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md font-medium transition"
          >
            🤝 Connect & Share Details
          </button>
          <button
            onClick={() => window.open(`https://maps.google.com/maps?q=${ride.pickupCoords.lat},${ride.pickupCoords.lng}`, '_blank')}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-md transition"
          >
            📍
          </button>
        </div>
      </div>
    </div>
  );
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

  const [userData, setUserData] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    completed: 0,
  });

  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [isScheduled, setIsScheduled] = useState(false);

  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropCoords, setDropCoords] = useState(null);

  const [routeCoords, setRouteCoords] = useState([]);
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [rideType, setRideType] = useState(null);
  const [pendingRides, setPendingRides] = useState([]);
  const [nearbyRides, setNearbyRides] = useState([]);
  const [matchedRides, setMatchedRides] = useState([]);
  const [dismissedRides, setDismissedRides] = useState([]);

  // Auth
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return navigate("/login");

    axios
      .get("/api/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setUserData(res.data));

    fetchStats();
    fetchPendingRides();
  }, [navigate]);

  const fetchStats = async () => {
    const token = localStorage.getItem("token");
    const res = await axios.get("/api/rides/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setStats(res.data);
  };

  const fetchPendingRides = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/rides/my", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pending = res.data
        .filter((ride) => ride.status === "pending")
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setPendingRides(pending);
    } catch (err) {
      console.error("Error fetching pending rides:", err);
    }
  };

  // Enhanced route fetching
  const fetchRoute = async (start, end) => {
    try {
      const token = localStorage.getItem("token");

      try {
        const res = await axios.post(
          "/api/rides/route",
          { start, end },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const route = res.data;
        setRouteCoords(
          route.geometry.coordinates.map(([lng, lat]) => [lat, lng])
        );
        setDistance((route.distance / 1000).toFixed(2));
        setDuration(Math.round(route.duration / 60));
        return;
      } catch (backendError) {
        console.log("Backend route failed, trying OSRM...");
      }

      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

      const response = await fetch(osrmUrl);
      if (response.ok) {
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          setRouteCoords(
            route.geometry.coordinates.map(([lng, lat]) => [lat, lng])
          );
          setDistance((route.distance / 1000).toFixed(2));
          setDuration(Math.round(route.duration / 60));
        }
      }
    } catch (err) {
      console.error("Route fetch error:", err);
      setRouteCoords([[start.lat, start.lng], [end.lat, end.lng]]);

      const R = 6371;
      const dLat = (end.lat - start.lat) * Math.PI / 180;
      const dLng = (end.lng - start.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(start.lat * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      setDistance(distance.toFixed(2));
      setDuration(Math.round(distance * 2));
    }
  };

  useEffect(() => {
    if (pickupCoords && dropCoords) {
      fetchRoute(pickupCoords, dropCoords);
    }
  }, [pickupCoords, dropCoords]);

  // Enhanced nearby rides search with matching
  const findNearbyRides = useCallback(async () => {
    if (!pickupCoords) return;

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "/api/rides/find",
        {
          lat: pickupCoords.lat,
          lng: pickupCoords.lng,
          drop: drop, // Send drop location for better matching
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const ridesWithDistance = res.data.map(ride => ({
        ...ride,
        distance: calculateDistance(
          pickupCoords.lat,
          pickupCoords.lng,
          ride.pickupCoords.lat,
          ride.pickupCoords.lng
        ).toFixed(1)
      }));

      setNearbyRides(ridesWithDistance);

      // Find matching rides (same or similar destination)
      if (drop) {
        const matches = ridesWithDistance.filter(ride => {
          const dropSimilarity = ride.drop.toLowerCase().includes(drop.toLowerCase()) ||
            drop.toLowerCase().includes(ride.drop.toLowerCase());
          const isClose = parseFloat(ride.distance) <= 5; // Within 5km
          const notDismissed = !dismissedRides.includes(ride._id);

          return dropSimilarity && isClose && notDismissed;
        });

        setMatchedRides(matches);
      }
    } catch (err) {
      console.error("Find rides error:", err);
    }
  }, [pickupCoords, drop, dismissedRides]);

  useEffect(() => {
    if (pickupCoords && drop) {
      findNearbyRides();
    }
  }, [pickupCoords, drop, findNearbyRides]);

  // Handle current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          try {
            // Reverse geocode to get address
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
              {
                headers: {
                  'User-Agent': 'CarpoolingApp/1.0 (contact@example.com)',
                  'Accept': 'application/json'
                }
              }
            );
            
            if (response.ok) {
              const data = await response.json();
              setPickup(data.display_name);
              setPickupCoords({ lat: latitude, lng: longitude });
            } else {
              // Fallback if reverse geocoding fails
              setPickup(`Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
              setPickupCoords({ lat: latitude, lng: longitude });
            }
          } catch (error) {
            // Fallback if API fails
            setPickup(`Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
            setPickupCoords({ lat: latitude, lng: longitude });
          }
        },
        (error) => {
          alert('Unable to get your location. Please enter manually.');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    } else {
      alert('Geolocation is not supported by this browser.');
    }
  };

  // Handle pickup location selection
  const handlePickupSelect = (locationData) => {
    setPickupCoords({
      lat: locationData.lat,
      lng: locationData.lng
    });
  };

  // Handle drop location selection  
  const handleDropSelect = (locationData) => {
    setDropCoords({
      lat: locationData.lat,
      lng: locationData.lng
    });
  };

  // Handle ride connection
  const handleConnectRide = async (ride) => {
    try {
      const token = localStorage.getItem("token");

      // Create a connection request
      await axios.post(
        "/api/rides/connect",
        {
          rideId: ride._id,
          message: `Hi! I'd like to join your ride from ${ride.pickup} to ${ride.drop}. My pickup is at ${pickup}.`
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      alert(`Connection request sent to ${ride.user?.name || 'driver'}! They will be notified and can share contact details.`);

      // Remove from matched rides
      setMatchedRides(prev => prev.filter(r => r._id !== ride._id));

    } catch (err) {
      console.error("Connect error:", err);
      alert("Failed to connect. Please try again.");
    }
  };

  // Handle dismissing a ride match
  const handleDismissRide = (rideId) => {
    setDismissedRides(prev => [...prev, rideId]);
    setMatchedRides(prev => prev.filter(r => r._id !== rideId));
  };

  // Handle booking - Updated to integrate with LiveSearch
  const handleBooking = async (type) => {
    if (!pickup || !drop) {
      alert("Please fill in pickup and drop locations");
      return;
    }

    if (!pickupCoords || !dropCoords) {
      alert("Please wait for the addresses to be resolved on the map");
      return;
    }

    if (isScheduled) {
      if (!dateTime) {
        alert("Please select a date and time for your scheduled ride");
        return;
      }

      const selectedDateTime = new Date(dateTime);
      const now = new Date();

      if (selectedDateTime <= now) {
        alert("Please select a future date and time for scheduling");
        return;
      }

      // For scheduled rides, create a regular ride in database
      try {
        const token = localStorage.getItem("token");
        const rideDateTime = dateTime;

        await axios.post(
          "/api/rides/book",
          {
            pickup,
            drop,
            dateTime: rideDateTime,
            type,
            isScheduled,
            pickupCoords,
            dropCoords,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        alert(`Ride scheduled successfully for ${new Date(dateTime).toLocaleString()}!`);

        // Reset form
        setPickup("");
        setDrop("");
        setDateTime("");
        setIsScheduled(false);
        setPickupCoords(null);
        setDropCoords(null);
        setRouteCoords([]);
        setDistance(null);
        setDuration(null);
        setRideType(null);
        setNearbyRides([]);
        setMatchedRides([]);

        fetchStats();
        fetchPendingRides();
      } catch (err) {
        console.error("Booking error:", err);
        alert(err.response?.data?.message || "Failed to book ride");
      }
    } else {
      // For immediate rides, don't create a database entry - let LiveSearch handle it
      alert(`Starting live search for ${type === "poolCar" ? "pooling a ride" : "finding a car"}. Use the Live Search section below to find matches!`);
      
      // Scroll to LiveSearch component
      const liveSearchElement = document.querySelector('[data-component="live-search"]');
      if (liveSearchElement) {
        liveSearchElement.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // Handle ending a ride
  const handleEndRide = async (rideId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `/api/rides/${rideId}/complete`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      alert("Ride completed successfully!");
      fetchStats();
      fetchPendingRides();
    } catch (err) {
      console.error("End ride error:", err);
      const errorMessage = err.response?.data?.message || err.message || "Failed to complete ride";
      alert(`Failed to end ride: ${errorMessage}`);
    }
  };

  return (
    <div className="flex min-h-screen bg-blue-50">
      {/* SIDEBAR */}
      <aside
        className={`${isOpen ? "w-72" : "w-20"} bg-blue-800 text-white p-6`}
      >
        <button onClick={() => setIsOpen(!isOpen)}>☰</button>
        <ul className="mt-10 space-y-6">
          <li>🚗 {isOpen && "Book Ride"}</li>
          <li onClick={() => navigate("/my-rides")}>
            🗓 {isOpen && "My Rides"}
          </li>
        </ul>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-10 space-y-6">
        <h1 className="text-3xl font-bold">Welcome {userData?.name}</h1>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-600 text-white p-4 rounded">
            Total {stats.total}
          </div>
          <div className="bg-yellow-500 text-white p-4 rounded">
            Pending {stats.pending}
          </div>
          <div className="bg-green-600 text-white p-4 rounded">
            Completed {stats.completed}
          </div>
        </div>

        {/* Ride Matches - Glowing Cards */}
        {matchedRides.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-gray-800 flex items-center">
              ✨ Perfect Matches Found!
              <span className="ml-2 bg-green-500 text-white text-sm px-2 py-1 rounded-full">
                {matchedRides.length}
              </span>
            </h2>
            {matchedRides.map((ride) => (
              <RideMatchCard
                key={ride._id}
                ride={ride}
                distance={ride.distance}
                onConnect={handleConnectRide}
                onDismiss={() => handleDismissRide(ride._id)}
              />
            ))}
          </div>
        )}

        {/* Active Ride */}
        {pendingRides.length > 0 && (
          <div className="bg-white p-6 rounded shadow-lg border-2 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">
                  Active Ride
                </h2>
                <p className="text-gray-600">
                  <strong>From:</strong> {pendingRides[0].pickup}
                </p>
                <p className="text-gray-600">
                  <strong>To:</strong> {pendingRides[0].drop}
                </p>
                <p className="text-gray-600">
                  <strong>Date:</strong>{" "}
                  {new Date(pendingRides[0].dateTime).toLocaleString()}
                </p>
                <span className={`inline-block mt-2 px-3 py-1 rounded text-sm font-semibold ${pendingRides[0].type === "poolCar"
                  ? "bg-green-100 text-green-800"
                  : "bg-purple-100 text-purple-800"
                  }`}>
                  {pendingRides[0].type === "poolCar" ? "🚗 Pooling Car" : "🔍 Finding Car"}
                </span>
              </div>
              <button
                onClick={() => handleEndRide(pendingRides[0]._id)}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg text-lg shadow-md transition"
              >
                End Ride
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-6">
          <div className="flex-1 h-[420px] bg-white rounded shadow">
            <MapContainer
              center={{ lat: 20.5937, lng: 78.9629 }}
              zoom={6}
              style={{ height: "100%" }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              {/* User's pickup location */}
              {pickupCoords && (
                <Marker position={pickupCoords} icon={pickupIcon}>
                  <Popup>
                    <div className="text-center">
                      <strong>Your Pickup</strong><br />
                      {pickup}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* User's drop location */}
              {dropCoords && (
                <Marker position={dropCoords} icon={dropIcon}>
                  <Popup>
                    <div className="text-center">
                      <strong>Your Destination</strong><br />
                      {drop}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Available nearby rides */}
              {nearbyRides.map((ride) => (
                <Marker
                  key={ride._id}
                  position={[ride.pickupCoords.lat, ride.pickupCoords.lng]}
                  icon={availableRideIcon}
                >
                  <Popup>
                    <div className="text-center min-w-[200px]">
                      <strong className="text-blue-600">
                        {ride.user?.name || 'Driver'}
                      </strong><br />
                      <div className="text-sm text-gray-600 mt-1">
                        🚗 {ride.type === 'poolCar' ? 'Offering Ride' : 'Looking for Ride'}
                      </div>
                      <div className="text-sm mt-2">
                        <strong>From:</strong> {ride.pickup}<br />
                        <strong>To:</strong> {ride.drop}<br />
                        <strong>Distance:</strong> {ride.distance} km away
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(ride.dateTime).toLocaleString()}
                      </div>
                      {ride.type === 'poolCar' && (
                        <button
                          onClick={() => handleConnectRide(ride)}
                          className="mt-2 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Route visualization */}
              {routeCoords.length > 0 && (
                <>
                  <Polyline
                    positions={routeCoords}
                    pathOptions={{
                      color: "#2563eb",
                      weight: 4,
                      opacity: 0.8,
                      dashArray: "5, 10"
                    }}
                  />
                  <FitRoute coords={routeCoords} />
                </>
              )}
            </MapContainer>
          </div>

          <div className="w-96 bg-white p-6 rounded shadow space-y-4">
            {/* Nearby rides info */}
            {nearbyRides.length > 0 && (
              <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                <p className="text-sm text-blue-700 text-center">
                  🔍 Found {nearbyRides.length} nearby ride{nearbyRides.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                📍 Pickup Location
              </label>
              <div className="flex gap-2">
                <LocationAutocomplete
                  value={pickup}
                  onChange={setPickup}
                  onSelect={handlePickupSelect}
                  placeholder="Enter pickup location..."
                  className="border border-gray-300 p-3 flex-1 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={getCurrentLocation}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-3 rounded-md font-medium transition whitespace-nowrap"
                  title="Use Current Location"
                >
                  📍 Current
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                🎯 Drop Location
              </label>
              <LocationAutocomplete
                value={drop}
                onChange={setDrop}
                onSelect={handleDropSelect}
                placeholder="Enter drop location..."
                className="border border-gray-300 p-3 w-full rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                🕒 Booking Type
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsScheduled(false)}
                  className={`flex-1 py-2 px-3 rounded text-sm font-medium transition ${
                    !isScheduled
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Now
                </button>
                <button
                  onClick={() => setIsScheduled(true)}
                  className={`flex-1 py-2 px-3 rounded text-sm font-medium transition ${
                    isScheduled
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Schedule
                </button>
              </div>
            </div>

            {isScheduled && (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  📅 Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="border border-gray-300 p-3 w-full rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            {/* Route Info */}
            {distance && duration && (
              <div className="bg-green-50 p-3 rounded-md border border-green-200">
                <p className="text-sm text-green-700">
                  <strong>Distance:</strong> {distance} km
                </p>
                <p className="text-sm text-green-700">
                  <strong>Duration:</strong> ~{duration} min
                </p>
              </div>
            )}

            {/* Booking Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => handleBooking("poolCar")}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-semibold text-lg shadow-md transition"
              >
                🚗 Pool a Ride
              </button>
              <button
                onClick={() => handleBooking("findCar")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold text-lg shadow-md transition"
              >
                🔍 Find a Car
              </button>
            </div>

            {/* Live Search Component */}
            <div data-component="live-search">
              <LiveSearch
                pickup={pickup}
                drop={drop}
                pickupCoords={pickupCoords}
                dropCoords={dropCoords}
                onMatch={(matchData) => {
                  console.log('Match found:', matchData);
                  alert(`🎉 Connected with ${matchData.to.name}!\n\nContact: ${matchData.to.email}\nRoute: ${matchData.to.route}`);
                }}
                onStop={() => {
                  console.log('Live search stopped');
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}