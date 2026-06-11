import { useState } from "react";
import { useNavigate } from "react-router-dom";

const IconTrusted = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="6" width="36" height="36" rx="10" fill="#E6F7F5" />
    <path d="M24 24.5c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Z" stroke="#0ea5a4" strokeWidth="2" />
    <path d="M16 32c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke="#0ea5a4" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconRoutes = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="6" width="36" height="36" rx="10" fill="#E6F7F5" />
    <path d="M24 34s8-5 8-12a8 8 0 1 0-16 0c0 7 8 12 8 12Z" stroke="#0ea5a4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="24" cy="22" r="2" fill="#0ea5a4" />
  </svg>
);

const IconSecure = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="6" width="36" height="36" rx="10" fill="#E6F7F5" />
    <path d="M24 14 16 18v6c0 5.333 3.333 8.667 8 10 4.667-1.333 8-4.667 8-10v-6l-8-4Z" stroke="#0ea5a4" strokeWidth="2" strokeLinejoin="round" />
    <path d="m21 24 2.2 2.2L27 22.4" stroke="#0ea5a4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Home() {
  const navigate = useNavigate();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const isLoggedIn = () => !!localStorage.getItem("driveBuddy_session");

  const handleProtectedAction = () => {
    if (isLoggedIn()) {
      navigate("/dashboard");
      return;
    }
    setShowAuthPrompt(true);
  };

  const closePrompt = () => setShowAuthPrompt(false);

  return (
    <div className="min-h-screen bg-mutedbg text-slate-900">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-white border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <span className="text-accent text-2xl">🚗</span>
            <span>DriveBuddy</span>
          </div>
          <div className="flex items-center gap-4 text-sm font-semibold">
            <button
              className="text-slate-800 hover:text-slate-900"
              onClick={() => navigate("/login")}
            >
              Login
            </button>
            <button
              className="rounded-md bg-[#0f1f3a] px-4 py-2 text-white shadow-sm hover:bg-[#13284a]"
              onClick={() => navigate("/register")}
            >
              Register
            </button>
          </div>
        </div>
      </header>

      <main className="pt-24">
        {/* Hero */}
        <section className="mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 text-center">
          <h1 className="text-[44px] sm:text-5xl md:text-6xl font-black leading-tight text-slate-900 tracking-tight">
            Share. Save.
            <br />
            <span className="text-accent">Travel smarter</span> with
            <br />
            DriveBuddy.
          </h1>
          <p className="mt-6 max-w-3xl text-lg text-slate-600">
            Connect with trusted drivers and riders in your community. Reduce costs,
            cut emissions, and make your daily commute more enjoyable.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <button
              className="w-full sm:w-auto rounded-md bg-primary px-7 py-3 text-white font-semibold shadow-sm hover:bg-[#13284a]"
              onClick={handleProtectedAction}
            >
              Find a Carpool <span className="ml-1">→</span>
            </button>
            <button
              className="w-full sm:w-auto rounded-md border border-slate-200 bg-white px-7 py-3 text-slate-800 font-semibold hover:border-slate-300"
              onClick={handleProtectedAction}
            >
              Offer a Ride
            </button>
          </div>
        </section>

        {/* Why choose */}
        <section className="bg-white border-t border-b border-slate-200 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl md:text-4xl font-black text-slate-900">
              Why choose DriveBuddy?
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {[
                { title: "Trusted Community", desc: "All users are verified. Ride with confidence knowing your travel companions are authenticated.", icon: <IconTrusted /> },
                { title: "Flexible Routes", desc: "Find rides that match your schedule and route. From daily commutes to one-time trips.", icon: <IconRoutes /> },
                { title: "Safe & Secure", desc: "Your safety is our priority. In-app messaging and ride tracking keep you protected.", icon: <IconSecure /> },
              ].map((item) => (
                <div
                  key={item.title}
                  className="text-center flex flex-col items-center gap-3 px-2"
                >
                  <div className="mb-5 flex justify-center">{item.icon}</div>
                  <h3 className="text-xl font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-slate-600 leading-relaxed max-w-xs">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <section className="bg-mutedbg py-16">
          <div className="mx-auto flex max-w-5xl flex-col items-center px-5 text-center">
            <h3 className="text-3xl md:text-4xl font-black text-slate-900">
              Ready to start sharing rides?
            </h3>
            <p className="mt-4 max-w-2xl text-slate-600">
              Join thousands of commuters who are saving money and reducing their carbon footprint.
            </p>
            <button
              className="mt-8 rounded-md bg-primary px-7 py-3 text-white font-semibold shadow-sm hover:bg-[#13284a]"
              onClick={() => navigate("/register")}
            >
              Get Started — It&apos;s Free
            </button>
          </div>
        </section>
      </main>

      {/* Auth prompt modal */}
      {showAuthPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Please Log In</h3>
            <p className="mt-2 text-slate-600">
              Please log in to continue — secure and fast.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                className="flex-1 rounded-md bg-primary px-4 py-2 text-white font-semibold hover:bg-[#13284a]"
                onClick={() => navigate("/login")}
              >
                Login
              </button>
              <button
                className="flex-1 rounded-md border border-slate-200 px-4 py-2 font-semibold text-slate-800 hover:border-slate-300"
                onClick={() => navigate("/register")}
              >
                Register
              </button>
            </div>
            <button
              className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700"
              onClick={closePrompt}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
