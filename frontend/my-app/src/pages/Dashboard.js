import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

function Dashboard() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      // Not logged in, redirect to login
      navigate("/login");
      return;
    }

    // Fetch user info (optional, from backend)
    const fetchUser = async () => {
      try {
        const res = await axios.get("/api/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUserData(res.data);
      } catch (err) {
        console.log(err);
        // Invalid token, redirect to login
        localStorage.removeItem("token");
        navigate("/login");
      }
    };

    fetchUser();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Dashboard</h1>
      {userData ? (
        <div>
          <p>Welcome, {userData.name}!</p>
        </div>
      ) : (
        <p>Loading user info...</p>
      )}
      <button onClick={handleLogout} style={{ marginTop: "20px", padding: "10px 20px" }}>
        Logout
      </button>
    </div>
  );
}

export default Dashboard;
