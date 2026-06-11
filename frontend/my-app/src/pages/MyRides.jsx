import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function MyRides() {
  const [rides, setRides] = useState([]);
  const navigate = useNavigate();

  const fetchRides = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/rides/my", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRides(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    fetchRides();
  }, [navigate]);

  // ✅ Mark ride as completed
  const markCompleted = async (id) => {
    try {
      const token = localStorage.getItem("token");

      await axios.put(
        `/api/rides/${id}/complete`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      fetchRides();
    } catch (err) {
      alert("Failed to mark ride as completed");
    }
  };

  // ❌ Cancel ride (FIXED)
  const handleCancelRide = async (id) => {
    try {
      const token = localStorage.getItem("token");

      await axios.delete(`/api/rides/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert("Ride cancelled successfully");

      // Refresh rides list
      fetchRides();
    } catch (err) {
      console.error("Cancel ride error:", err);
      alert("Failed to cancel ride");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-6">My Rides</h1>

      {rides.length === 0 ? (
        <p className="text-gray-600">No rides booked yet.</p>
      ) : (
        <div className="space-y-4">
          {rides.map((ride) => (
            <div
              key={ride._id}
              className="bg-white p-6 rounded-xl shadow flex justify-between items-center"
            >
              <div>
                <p><strong>Pickup:</strong> {ride.pickup}</p>
                <p><strong>Drop:</strong> {ride.drop}</p>
                <p>
                  <strong>Date:</strong>{" "}
                  {new Date(ride.dateTime).toLocaleString()}
                </p>
                <p className="mt-1">
                  <span
                    className={`text-sm px-2 py-1 rounded ${
                      ride.type === "poolCar"
                        ? "bg-green-100 text-green-800"
                        : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {ride.type === "poolCar"
                      ? "🚗 Pooling Car"
                      : "🔍 Finding Car"}
                  </span>
                  {ride.isScheduled && (
                    <span className="ml-2 text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                      📅 Scheduled
                    </span>
                  )}
                  {!ride.isScheduled && (
                    <span className="ml-2 text-xs px-2 py-1 rounded bg-orange-100 text-orange-800">
                      ⚡ Immediate
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`px-4 py-1 rounded-full text-white text-sm ${
                    ride.status === "pending"
                      ? "bg-yellow-500"
                      : "bg-green-600"
                  }`}
                >
                  {ride.status}
                </span>

                {ride.status === "pending" && (
                  <>
                    <button
                      onClick={() => markCompleted(ride._id)}
                      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition font-semibold"
                    >
                      End Ride
                    </button>

                    <button
                      onClick={() => handleCancelRide(ride._id)}
                      className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition font-semibold"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyRides;
