import styles from './BuscadorCTA.module.css';

// URL del buscador público de la inmobiliaria (portada del vanilla).
const BUSCADOR_URL = 'https://buscador.habitarinmobiliaria.co';

// Banner que invita a explorar el buscador externo cuando ninguna de las
// opciones seleccionadas convence al cliente.
export default function BuscadorCTA() {
  return (
    <div className={styles.wrapper}>
      <a
        className={styles.link}
        href={BUSCADOR_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className={styles.text}>¿No te convencen las opciones? </span>
        <span className={styles.highlight}>Visita nuestro buscador de inmuebles.</span>
      </a>
    </div>
  );
}
