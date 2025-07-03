"use client";

import React, { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";

interface HeaderProps {
  currentDateTime: Date;
  pharmacyName?: string;
}

const Header: React.FC<HeaderProps> = ({ currentDateTime, pharmacyName }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const formatDate = (date: Date): string => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "America/Mexico_City",
    };
    return date.toLocaleDateString("es-MX", options);
  };

  const handleLogout = () => {
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md border-b border-white/30 dark:border-gray-700/30 shadow-md bg-white/60 dark:bg-gray-900/60">
      <div className="container mx-auto px-4 flex items-center justify-between h-20 relative z-10">
        {/* Logo + Nombre */}
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="CareLux Logo" className="w-12 h-12 rounded-md shadow-md" />
          <div className="leading-tight">
            <h1 className="text-2xl font-bold text-blue-500 dark:text-blue-300">
              {pharmacyName ?? "Farmacia"}
            </h1>
            <span className="text-sm text-blue-400/80 dark:text-blue-300/60">CareLux Point</span>
          </div>
        </div>

        {/* Fecha y hora */}
        <div className="hidden lg:flex bg-white/30 dark:bg-gray-800/30 px-6 py-2 rounded-xl border border-white/40 dark:border-gray-600/40 backdrop-blur text-center shadow-sm">
          <span className="text-lg font-medium text-gray-900 dark:text-white">{formatDate(currentDateTime)}</span>
        </div>

        {/* Navegación */}
        <nav className="hidden md:flex gap-3 items-center">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition text-sm font-medium"
          >
            <LogOut size={16} />
            Cerrar Sesión
          </button>
        </nav>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-2 rounded-md bg-white/40 dark:bg-gray-700/40 border border-white/30 dark:border-gray-600/30"
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white/30 dark:bg-gray-900/30 border-t border-white/30 dark:border-gray-700/30 px-4 py-4 space-y-4 shadow-lg">
          <div className="text-center text-base text-gray-800 dark:text-white">
            {formatDate(currentDateTime)}
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 p-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition"
            >
              <LogOut size={18} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
