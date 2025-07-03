import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Pagina_Inicio';
import Login from './pages/Login';
import Register from './pages/Register';
//import Pricing from './pages/Pricing';
import SetupFarmacia from './pages/SetupFarmacia';
//import PaneldeAdministrador from './pages/PharmacyDashboard';
import Interfaz_Pacinte from './pages/paciente_interfaz';
import Interfaz_Farmaceutico from './pages/Interfaz_Farmaceutico';
import Interfaz_Doctor from './pages/Doctor_interfaz';
import RecuperarContraseña from './components/Login/Recuperarcontraseña';
import CambiarContraseña from './components/Login/CambiarContraseña';
import Terminos from "./components/Login/terminos";
import Privacidad from './components/Login/privacidad';
import Ayuda from './components/Login/ayuda';




function App() {
  // Add a key with timestamp to force component refresh
  const timestamp: number = Date.now();
  
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/setup_farmacia" element={<SetupFarmacia />} />
        <Route path="/Paciente" element={<Interfaz_Pacinte key={timestamp} />} />
        <Route path="/farmaceutico" element={<Interfaz_Farmaceutico key={timestamp} />} />
        <Route path="/Recuperarcontraseña" element={<RecuperarContraseña key={timestamp} />} />
        <Route path="/Doctor" element={<Interfaz_Doctor key={timestamp} />} />
        <Route path="/cambiar-contraseña" element={<CambiarContraseña key={timestamp} />} />
        <Route path='/ayuda' element={<Ayuda key={timestamp} />} />
        <Route path='/terminos' element={<Terminos key={timestamp} />} />
        <Route path='/privacidad' element={<Privacidad key={timestamp} />} />




       
       
       {/*   
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/dashboard" element={<PaneldeAdministrador />} />
      
        <Route path="/farmaceutico" element={<Interfaz_Farmaceutico key={timestamp} />} />
        <Route path="/Paciente" element={<Interfaz_Pacinte key={timestamp} />} />
        Route for specific pharmacy by ID 
        <Route path="/farmacia/:farmaciaId" element={<Interfaz_Farmaceutico key={timestamp} />} />
*/}
      </Routes>
    </Router>
  );
}

export default App;
