"use client"

import { useState, useRef, useEffect, createElement } from "react";
import {
  Package2,
  Plus,
  Home,
  CalendarIcon,
  FileText,
  User,
} from "lucide-react"

const primaryColor = '#008AC5';
const primaryColorDark = '#63B3ED'; // A lighter, brighter blue for dark mode

const itemsWith6 = [
  { view: 'home', label: 'Inicio', angle: 0, icon: Home },
  { view: 'appointments', label: 'Citas', angle: 60, icon: CalendarIcon },
  { view: 'medications', label: 'Recetas', angle: 120, icon: FileText },
  { view: 'EREBUS', label: 'EREBUS', angle: 180, icon: FileText },
  { view: 'pharmacies', label: 'Farmacias', angle: 240, icon: Package2 },
  { view: 'profile', label: 'Perfil', angle: 300, icon: User },
];

interface FloatingRadialNavProps {
  currentView?: string;
  onChange?: (view: string) => void;
}

export function FloatingRadialNav({ currentView, onChange }: FloatingRadialNavProps) {
  const [open, setOpen] = useState(false);
  const [dialRotation, setDialRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);

  const startAngleRef = useRef(0);
  const previousMouseAngleRef = useRef(0);
  const hasDraggedRef = useRef(false);

  const getDialCenter = () => {
    if (!dialRef.current) return { x: 0, y: 0 };
    const rect = dialRef.current.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  const getMouseAngle = (clientX: number, clientY: number) => {
    const center = getDialCenter();
    const deltaX = clientX - center.x;
    const deltaY = clientY - center.y;
    let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    angle = (angle + 360) % 360;
    return angle;
  };

  const handleItemClick = (view: string) => {
    onChange?.(view);
    setOpen(false);
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    if (!dialRef.current) return;

    const target = event.target as HTMLElement;
    // Prevent dragging if clicking on an item's icon or text
    if (target.closest('[data-item-id]') || target.closest('button')) {
      return;
    }

    setIsDragging(true);
    hasDraggedRef.current = false;
    const initialAngle = getMouseAngle(event.clientX, event.clientY);
    startAngleRef.current = initialAngle;
    previousMouseAngleRef.current = initialAngle;
    document.body.style.cursor = 'grabbing';
    document.body.style.overflow = 'hidden';
    document.body.style.userSelect = 'none';
  };

  // FIX: Changed parameter type to a generic object that both event types satisfy.
  const handleMouseMove = (event: { clientX: number; clientY: number }) => {
    if (!isDragging || !dialRef.current) return;

    hasDraggedRef.current = true;

    const currentMouseAngle = getMouseAngle(event.clientX, event.clientY);
    let deltaAngle = currentMouseAngle - previousMouseAngleRef.current;

    // Normalize deltaAngle to be between -180 and 180
    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    setDialRotation(prevRotation => prevRotation + deltaAngle);
    previousMouseAngleRef.current = currentMouseAngle;
  };

  const handleMouseUp = () => {
    if (!isDragging) return; // Ensure we only process if dragging was active

    let finalSelectedView: string | null = null;

    if (dialRef.current && hasDraggedRef.current) {
      const currentDialTransform = dialRef.current.style.transform;
      const rotationMatch = currentDialTransform.match(/rotate\(([^)]+)\)/);

      if (rotationMatch && rotationMatch[1]) {
        const rotationValue = parseFloat(rotationMatch[1]);
        const normalizedRotation = ((rotationValue % 360) + 360) % 360;

        let closestItemIndex = -1;
        let smallestAngleDifference = 360;

        itemsWith6.forEach((item, index) => {
          // Calculate the effective angle of the item considering the dial's rotation
          const effectiveItemAngle = (item.angle + normalizedRotation);
          const normalizedEffectiveItemAngle = ((effectiveItemAngle % 360) + 360) % 360;

          // Calculate the difference from the 'top' (0 degrees)
          let angleDifference = normalizedEffectiveItemAngle;
          if (angleDifference > 180) {
            angleDifference = 360 - angleDifference;
          }

          const sectorSize = 360 / itemsWith6.length;
          const selectionTolerance = sectorSize / 2;

          // Check if the item is within the selection arc
          if (angleDifference < selectionTolerance) {
            if (angleDifference < smallestAngleDifference) {
              smallestAngleDifference = angleDifference;
              closestItemIndex = index;
            }
          }
        });

        if (closestItemIndex !== -1) {
          finalSelectedView = itemsWith6[closestItemIndex].view;
          handleItemClick(finalSelectedView); // Call handleItemClick to set view and close
        } else {
          // If no item was clearly selected after dragging, close the menu
          setOpen(false);
        }
      } else {
        // If transform was not found or invalid, close the menu
        setOpen(false);
      }
    } else if (isDragging && !hasDraggedRef.current) {
      // If it was a click (not a drag), the item would have been handled by its onClick
      // If it was a drag but very short, we might close it without selecting.
      setOpen(false);
    }

    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.overflow = '';
    document.body.style.userSelect = '';
  };

  useEffect(() => {
    const handleMouseMoveGlobal = (event: MouseEvent) => {
      // FIX: No need to create a synthetic event. The native event works with the new signature.
      handleMouseMove(event);
    };

    const handleMouseUpGlobal = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMoveGlobal);
      document.addEventListener('mouseup', handleMouseUpGlobal);
    } else {
      document.removeEventListener('mousemove', handleMouseMoveGlobal);
      document.removeEventListener('mouseup', handleMouseUpGlobal);
    }

    // Cleanup function to remove listeners and reset body styles
    return () => {
      document.removeEventListener('mousemove', handleMouseMoveGlobal);
      document.removeEventListener('mouseup', handleMouseUpGlobal);
      document.body.style.overflow = '';
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, dialRef, handleMouseMove, handleMouseUp]); // Dependencies ensure effects re-run when these change

  const currentDialTransform = `rotate(${dialRotation}deg)`;
  // A simple way to simulate dark mode, you'd typically use a context or hook for this.
  // For demonstration, we'll hardcode it. Replace `false` with your actual dark mode check.
  const isDarkMode = true; // <<< --- SET THIS TO YOUR ACTUAL DARK MODE CHECK --- >>>

  return (
    <>
      {!open && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <button
            onClick={() => setOpen(true)}
            className={`
              w-14 h-14 rounded-full text-white shadow-xl flex items-center justify-center transition-all duration-300 ease-in-out hover:rotate-90 hover:scale-110 active:scale-95
              ${isDarkMode ? 'dark-mode-button' : 'light-mode-button'}
            `}
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, #006DA0 100%)`,
              boxShadow: `0 8px 20px rgba(${parseInt(primaryColor.slice(1, 3), 16)}, ${parseInt(primaryColor.slice(3, 5), 16)}, ${parseInt(primaryColor.slice(5, 7), 16)}, 0.4)`
            }}
          >
            <Plus className="h-7 w-7 transition-transform duration-300" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-lg"
            onClick={() => setOpen(false)}
          />

          <div className="relative">
            <div
              ref={dialRef}
              className={`
                w-80 h-80 md:w-96 md:h-96 rounded-full shadow-2xl relative flex items-center justify-center
                transition-transform duration-300 ease-out
                ${isDarkMode ? 'dark-dial' : 'light-dial'}
              `}
              style={{
                transform: currentDialTransform,
                boxShadow: isDarkMode ? '0 15px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)' : '0 15px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)'
              }}
              onMouseDown={handleMouseDown}
            >
              {/* Central Button - Changed to a different color and removed the X */}
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering dial's mouseup
                    setOpen(false);
                  }}
                  className={`
                    w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center relative overflow-hidden transition-all duration-500 transform
                    border-4 border-transparent
                    ${isDarkMode ? 'dark-center-button' : 'light-center-button'}
                  `}
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor} 0%, #006DA0 100%)`, /* Keeping the original gradient for the central button */
                    boxShadow: `0 8px 20px rgba(${parseInt(primaryColor.slice(1, 3), 16)}, ${parseInt(primaryColor.slice(3, 5), 16)}, ${parseInt(primaryColor.slice(5, 7), 16)}, 0.4)`,
                  }}
                >
                  {/* Inner glow/highlight */}
                  <div
                    className="absolute inset-3 rounded-full opacity-40 blur-sm"
                    style={{
                      background: `linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 100%)`
                    }}
                  />
                </button>
              </div>

              {/* Radial Menu Items */}
              {itemsWith6.map((item, index) => {
                const angleRad = (item.angle * Math.PI) / 180;
                const radius = 120; // Adjust radius as needed
                const xPos = Math.cos(angleRad) * radius;
                const yPos = Math.sin(angleRad) * radius;

                const isActive = currentView === item.view;

                return (
                  <div
                    key={item.view}
                    data-item-id={item.view}
                    className="absolute flex flex-col items-center justify-center text-center cursor-pointer"
                    style={{
                      left: `calc(50% + ${xPos}px)`,
                      top: `calc(50% + ${yPos}px)`,
                      transform: "translate(-50%, -50%)",
                      animation: `fadeInScale 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) ${index * 0.05}s both`
                    }}
                    onClick={(e) => {
                       if (!isDragging) { // Prevent item click if it was a drag
                         e.stopPropagation();
                         handleItemClick(item.view);
                       }
                    }}
                  >
                    {createElement(item.icon, {
                      className: `
                        h-8 w-8 md:h-10 md:h-10
                        transition-all duration-300 ease-in-out
                        ${isActive
                          ? `text-blue-500 shadow-xl scale-110 animate-pulse`
                          : `text-gray-600 hover:text-blue-500 hover:scale-105 ${isDarkMode ? 'dark-icon' : 'light-icon'}`}
                      `,
                      color: isActive ? (isDarkMode ? primaryColorDark : primaryColor) : (isDarkMode ? '#9ca3af' : '#6b7280')
                    })}

                    <span className={`text-xs md:text-sm font-medium text-center leading-tight mt-1.5
                      ${isActive ? `font-bold ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}` : ` ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                    `}>
                      {item.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* FIX: Removed 'jsx' and 'global' props from the style tag */}
      <style>{`
        /* General Animations */
        @keyframes fadeInScale {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.7; }
          100% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
        }
        .animate-pulse {
          animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        /* Light Mode Base Styles */
        .light-mode-button {
          background: linear-gradient(135deg, ${primaryColor} 0%, #006DA0 100%);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
        }
        .light-dial {
          background-color: white;
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        }
        .light-center-button {
          background: linear-gradient(135deg, ${primaryColor} 0%, #006DA0 100%);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
        }
        .light-icon {
          color: #6b7280; /* Gray-500 */
        }

        /* Dark Mode Styles */
        @media (prefers-color-scheme: dark) {
          body { background-color: #111827; /* Very dark blue-gray */}

          .dark-mode-button {
            background: linear-gradient(135deg, ${primaryColorDark} 0%, #4682B4 100%); /* Slightly adjusted gradient for dark */
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
          }
          .dark-dial {
            background-color: #1f2937; /* Darker gray background */
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1); /* Subtle white border for depth */
          }
          .dark-center-button {
            background: linear-gradient(135deg, ${primaryColorDark} 0%, #4682B4 100%);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
          }
          .dark-icon {
            color: #9ca3af; /* Gray-400 */
          }

          /* Text color overrides for dark mode */
          .dark-dial span { color: #d1d5db !important; } /* Text color for item labels */
          .dark-dial span.font-bold { color: #93c5fd !important; } /* Active item text color */

          /* Specific overrides for elements that might not inherit well */
          .dark-dial .text-gray-600 { color: #9ca3af !important; } /* Icon color for non-active */
          .dark-dial .text-blue-500 { color: #6366f1 !important; } /* Active icon color */
          .dark-dial .text-blue-600 { color: #818cf8 !important; } /* Active text color */
          .dark-dial .text-gray-700 { color: #d1d5db !important; } /* Text color for non-active items */

          /* Background for the overlay when the menu is open */
          .fixed.inset-0.bg-black\/50.backdrop-blur-lg {
            background-color: rgba(0, 0, 0, 0.7); /* Darker overlay */
          }
        }
      `}</style>
    </>
  )
}