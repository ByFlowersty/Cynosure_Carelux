// Import necessary icons and hooks
import React, { useState, useEffect, type ComponentType, type SVGProps } from "react";
import {
  Menu,
  X,
  CheckCircle,
  ArrowRight,
  LineChart,
  Pill,
  Stethoscope,
  UserCircle,
  ShieldCheck,
  Sparkles,
  MoveUpRight,
  Sun,
  Moon,
} from "lucide-react";

// --- CSS Variables Definition ---
// This is the core of the performance improvement. We define all colors as CSS variables.
// Toggling the 'dark' class on the <html> element will swap all colors instantly via CSS,
// without causing React re-renders for styling.
const GlobalStyles = () => (
  <style jsx global>{`
    :root {
      /* New Color Palette Base */
      --primary-color: #29abe2;
      --primary-light: #5cc8f5;
      --primary-dark: #1f8acb;
      --secondary-accent: #7dd3fc;
      --primary-rgb: 86, 204, 245; /* Used for rgba() */
      --primary-dark-rgb: 31, 138, 203;

      /* Light Mode Palette */
      --bg: #f8fafc; /* offWhite (Slate-50) */
      --bg-gradient-start: #ffffff;
      --bg-gradient-end: #f0f9ff; /* bgGradientLight (Sky-50) */
      --text-heading: #1e293b; /* Slate-800 */
      --text-body: #334155; /* Slate-700 */
      --text-muted: #64748b; /* Slate-500 */
      --border-soft: rgba(31, 138, 203, 0.1);
      --border-focus: rgba(31, 138, 203, 0.6);
      --shadow-deep: rgba(31, 138, 203, 0.15);
      --header-bg: rgba(255, 255, 255, 0.7);
      --glass-bg: rgba(255, 255, 255, 0.6);
      --glass-border: rgba(255, 255, 255, 0.4);
      --selection-bg: var(--primary-color);
      --selection-text: #ffffff;
    }

    .dark {
      /* Dark Mode Palette */
      --primary-color: #5cc8f5; /* Lighter blue for dark mode */
      --primary-light: #7dd3fc;
      --primary-dark: #29abe2;
      --secondary-accent: #a5e8ff;
      --primary-rgb: 41, 171, 226;
      --primary-dark-rgb: 86, 204, 245;

      --bg: #0f172a; /* Slate-900 */
      --bg-gradient-start: #0f172a;
      --bg-gradient-end: #1e293b; /* Slate-800 */
      --text-heading: #f8fafc; /* Slate-50 */
      --text-body: #cbd5e1; /* Slate-300 */
      --text-muted: #94a3b8; /* Slate-400 */
      --border-soft: rgba(51, 65, 85, 0.5);
      --border-focus: rgba(86, 204, 245, 0.7);
      --shadow-deep: rgba(0, 0, 0, 0.25);
      --header-bg: rgba(30, 41, 59, 0.6);
      --glass-bg: rgba(30, 41, 59, 0.5);
      --glass-border: rgba(71, 85, 105, 0.4);
      --selection-bg: var(--primary-color);
      --selection-text: #0f172a;
    }
    
    /* Global Settings */
    html {
      scroll-behavior: smooth;
      color-scheme: light;
    }
    .dark html {
      color-scheme: dark;
    }
    body {
      background-color: var(--bg);
      color: var(--text-body);
      transition: background-color 0.3s ease, color 0.3s ease;
      overscroll-behavior-y: none;
    }
    ::selection {
      background-color: var(--selection-bg);
      color: var(--selection-text);
    }
    
    /* Animation Keyframes (unchanged) */
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .animate-fade-in-up { animation: fadeInUp 0.8s ease-out forwards; }
  `}</style>
);


// --- Reusable Button Component ---
// This centralizes button logic and styling, making the main component much cleaner.
// It uses pure CSS for hover/focus states, which is much more performant.
const Button = ({ variant = 'primary', className = '', children, ...props }) => {
  const baseClasses = `inline-flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--border-focus)] dark:focus-visible:ring-offset-slate-900 disabled:opacity-60 disabled:pointer-events-none transform active:scale-[0.98]`;

  const variants = {
    primary: `h-11 px-7 text-white shadow-lg border border-transparent 
               bg-gradient-to-br from-[var(--primary-light)] to-[var(--primary-color)]
               hover:from-[var(--primary-color)] hover:to-[var(--primary-dark)] hover:-translate-y-0.5 hover:shadow-xl`,
    secondary: `h-11 px-7 border 
                bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--primary-dark)]
                hover:border-[var(--primary-color)] hover:bg-[rgba(var(--primary-rgb),0.1)] hover:-translate-y-0.5`,
    text: `font-medium text-[var(--text-muted)] hover:text-[var(--primary-dark)] focus:text-[var(--primary-dark)]
           outline-none rounded-md px-1.5 py-1 focus-visible:ring-1 focus-visible:bg-[rgba(var(--primary-rgb),0.1)]`,
  };

  return (
    <button className={`${baseClasses} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};


export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    const initialMode = savedTheme ? savedTheme === 'dark' : prefersDark;
    
    setIsDarkMode(initialMode);
    if (initialMode) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', newMode);
  };

  // --- JSX ---
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden antialiased">
      <GlobalStyles />
      
      {/* === Header === */}
      <header 
        className="sticky top-0 z-50 w-full border-b backdrop-blur-md transition-colors duration-300"
        style={{ backgroundColor: 'var(--header-bg)', borderColor: 'var(--glass-border)' }}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex h-20 items-center justify-between">
          <a href="/" className="flex items-center gap-3 text-xl font-semibold group text-[var(--text-heading)]">
            <div className="p-1 rounded-lg shadow-sm bg-white/80 dark:bg-slate-700/50 transition-shadow group-hover:shadow-md">
              <img src="/logo.png" alt="Carelux Point Logo" className="h-9 w-9 group-hover:scale-105 transition-transform duration-300" />
            </div>
            <span className="transition-colors duration-200 group-hover:text-[var(--primary-color)]">
              Carelux Point
            </span>
          </a>
          
          <div className="hidden md:flex items-center gap-4">
            <a href="/login">
              <Button variant="secondary" className="h-10 px-5">Iniciar Sesión</Button>
            </a>
            <a href="/register">
              <Button variant="primary" className="h-10 px-5">Comenzar Gratis</Button>
            </a>
            <button
                onClick={toggleDarkMode}
                aria-label={isDarkMode ? "Activar modo claro" : "Activar modo oscuro"}
                className="p-2 rounded-full transition-all duration-200 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[var(--primary-color)]"
            >
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
          
          <button
              className="md:hidden p-2.5 text-[var(--text-muted)] hover:text-[var(--primary-dark)]"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="absolute top-full inset-x-0 md:hidden shadow-xl border-t" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border-soft)' }}>
            <div className="px-5 pt-5 pb-7 space-y-4">
              <a href="/login" className="w-full"><Button variant="secondary" className="w-full h-12 text-base">Iniciar Sesión</Button></a>
              <a href="/register" className="w-full"><Button variant="primary" className="w-full h-12 text-base">Comenzar Gratis</Button></a>
              <button
                  onClick={() => { toggleDarkMode(); setMobileMenuOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-lg transition-colors duration-200 bg-sky-100/70 text-sky-700 dark:bg-slate-700/50 dark:text-yellow-400"
              >
                  {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  <span>{isDarkMode ? "Modo Claro" : "Modo Oscuro"}</span>
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* === Hero Section === */}
        <section
          className="relative w-full pt-28 pb-32 md:pt-36 md:pb-40"
          style={{ background: `linear-gradient(155deg, var(--bg-gradient-start) 15%, var(--bg-gradient-end) 80%)` }}
        >
          <div className="absolute -top-1/4 left-1/4 w-1/2 h-1/2 rounded-full bg-[var(--secondary-accent)] opacity-10 dark:opacity-5 blur-3xl"></div>
          <div className="absolute -bottom-1/4 right-1/4 w-2/5 h-2/5 rounded-full bg-[var(--primary-color)] opacity-20 dark:opacity-10 blur-3xl"></div>
          
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid lg:grid-cols-2 gap-x-16 gap-y-12 items-center">
              <div className="max-w-xl text-left animate-fade-in-up">
                <span className="inline-block text-xs font-semibold uppercase tracking-widest mb-4 px-4 py-1.5 rounded-full bg-[rgba(var(--primary-rgb),0.1)] text-[var(--primary-dark)]">
                  Plataforma Conectada
                </span>
                <h1 className="text-5xl font-bold tracking-tighter sm:text-6xl md:text-7xl mb-6 !leading-tight text-[var(--text-heading)]">
                   Prescripción <span style={{ color: 'var(--primary-color)' }}>Digital</span> Segura y Eficiente.
                </h1>
                <p className="text-lg md:text-xl mb-12 leading-relaxed text-[var(--text-body)]">
                  Optimiza flujos, mejora la seguridad y conecta a profesionales y pacientes con nuestra solución integral.
                </p>
                <div className="flex flex-col sm:flex-row gap-5">
                   <a href="/register">
                    <Button variant="primary" className="text-base px-8 py-3.5 w-full sm:w-auto">
                       <span>Comienza Ahora</span>
                       <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                  <a href="#interfaces">
                     <Button variant="secondary" className="text-base px-8 py-3.5 w-full sm:w-auto">
                       Ver Plataforma
                    </Button>
                  </a>
                </div>
                 <div className="flex items-center gap-3 text-sm mt-10 text-[var(--text-muted)]">
                   <ShieldCheck className="h-5 w-5 flex-shrink-0 text-[var(--primary-color)]" strokeWidth={2}/>
                   <span>Máxima seguridad y cumplimiento normativo. Certificado.</span>
                 </div>
               </div>

              {/* Simplified Visual Element */}
              <div className="flex justify-center lg:justify-end relative group">
                 <div 
                    className="relative w-full max-w-md p-8 rounded-3xl shadow-2xl transition-all duration-300 group-hover:shadow-[0_10px_40px_-10px_var(--shadow-deep)]"
                    style={{
                      background: `linear-gradient(145deg, var(--bg-gradient-start), var(--bg))`,
                      boxShadow: `0 8px 30px -10px var(--shadow-deep)`,
                      border: `1px solid var(--border-soft)`
                    }}
                  >
                     <div className="flex flex-col items-center justify-center text-center transition-transform duration-500 ease-out group-hover:scale-105">
                        <img src="/logo.png" alt="Carelux Point Icon" className="w-1/3 h-1/3 mb-4 drop-shadow-lg" />
                        <h3 className="text-lg font-semibold text-[var(--text-heading)]">Carelux Point</h3>
                        <p className="text-xs text-[var(--text-muted)]">Prescripción Inteligente</p>
                     </div>
                 </div>
               </div>
            </div>
           </div>
         </section>

        {/* === Features Section (Simplified Cards) === */}
        <section className="w-full py-24 md:py-32">
           <div className="container mx-auto px-4 sm:px-6 lg:px-8">
             <div className="text-center max-w-3xl mx-auto mb-20">
                <h2 className="text-4xl font-bold tracking-tight md:text-5xl mb-5 text-[var(--text-heading)]">
                    Diseñado para <span className="text-[var(--primary-color)]">Eficiencia y Confianza</span>
                </h2>
                <p className="text-lg text-[var(--text-body)]">
                   Ventajas clave que transforman tu práctica diaria con tecnología segura y fácil de usar.
                </p>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               <FeatureItem icon={ShieldCheck} title="Seguridad Inquebrantable" description="Encriptación de grado militar y protocolos estrictos para la máxima protección de datos."/>
               <FeatureItem icon={Sparkles} title="Experiencia Fluida" description="Interfaz intuitiva y moderna, diseñada para una navegación sin esfuerzo y adopción rápida."/>
               <FeatureItem icon={LineChart} title="Acceso Unificado" description="Gestión centralizada disponible 24/7 desde cualquier dispositivo, asegurando continuidad."/>
             </div>
           </div>
         </section>
        
        {/* === CTA Section (Simplified) === */}
        <section 
            className="w-full py-28 md:py-36"
            style={{ background: `linear-gradient(135deg, var(--primary-dark) 0%, var(--primary-color) 100%)` }}
        >
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
                <Sparkles className="h-12 w-12 mx-auto mb-6 text-white/50" />
                <h2 className="text-4xl font-bold text-white sm:text-5xl md:text-6xl mb-6 max-w-4xl mx-auto !leading-tight drop-shadow-lg">
                 Transforma Tu Flujo de Prescripción Hoy Mismo.
                </h2>
                <p className="text-lg md:text-xl max-w-2xl mx-auto mb-12 text-white/90">
                  Únete a la revolución digital en salud. Empieza gratis y descubre el poder de Carelux Point.
                </p>
                <a href="/register">
                   <Button 
                     className="text-lg font-semibold h-14 px-10 shadow-xl !text-[var(--primary-dark)] !bg-white hover:!bg-slate-50 hover:!shadow-2xl hover:-translate-y-1"
                   >
                     Empieza Gratis Ahora
                     <ArrowRight className="ml-2.5 h-6 w-6" />
                  </Button>
                </a>
            </div>
        </section>
      </main>

      {/* === Footer === */}
      <footer className="w-full border-t pt-20 pb-16" style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border-soft)' }}>
         <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} Carelux Point Systems Inc. Todos los derechos reservados.
         </div>
      </footer>
    </div>
  );
}

// --- Simplified Helper Components ---

function FeatureItem({ icon: Icon, title, description }) {
  return (
    <div
      className="group relative flex flex-col items-center text-center p-8 rounded-2xl transition-all duration-300 border animate-fade-in-up"
      style={{ 
        backgroundColor: 'var(--bg)',
        borderColor: 'var(--border-soft)',
        boxShadow: `0 4px 15px -5px var(--shadow-deep)`
      }}
    >
      <div className="relative mb-6 w-16 h-16 flex items-center justify-center rounded-full transition-all duration-300 group-hover:scale-110" style={{ background: `linear-gradient(145deg, var(--bg-gradient-end), var(--bg))` }}>
          <div className="p-3.5 rounded-full text-white bg-gradient-to-br from-[var(--primary-light)] to-[var(--primary-color)]">
              <Icon className="h-7 w-7" strokeWidth={1.75} />
          </div>
      </div>
      <h3 className="text-xl font-semibold mb-3 text-[var(--text-heading)]">{title}</h3>
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">{description}</p>
    </div>
  );
}
