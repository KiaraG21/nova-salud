(() => {
  const consejos = {
    alimentacion: {
      title: 'Alimentación balanceada',
      intro: 'Una alimentación variada puede ayudar a cubrir las necesidades de energía y nutrientes de cada persona.',
      points: [
        'Incluye frutas y verduras de distintos colores a lo largo del día.',
        'Combina alimentos frescos con fuentes de proteína y cereales o tubérculos.',
        'Prefiere agua y limita los productos con exceso de azúcar, sal o grasas.'
      ]
    },
    infancia: {
      title: 'Cuidados básicos en la infancia',
      intro: 'Las rutinas de cuidado, prevención y acompañamiento favorecen el bienestar y desarrollo de niñas y niños.',
      points: [
        'Mantén al día sus controles de crecimiento y el calendario de vacunación.',
        'Para dormir, coloca al bebé boca arriba sobre una superficie firme y despejada.',
        'Consulta con un profesional si notas fiebre persistente, dificultad para respirar o decaimiento marcado.'
      ]
    },
    hidratacion: {
      title: 'La importancia de la hidratación',
      intro: 'Tomar líquidos durante el día ayuda al cuerpo a regular su temperatura y a realizar sus funciones.',
      points: [
        'Ten agua a la mano y toma con regularidad, especialmente si hace calor.',
        'Aumenta la atención a la hidratación durante actividad física o exposición al sol.',
        'Si tienes una condición que limita el consumo de líquidos, sigue la indicación de tu profesional de salud.'
      ]
    },
    'adultos-mayores': {
      title: 'Salud en adultos mayores',
      intro: 'Un cuidado integral combina movimiento seguro, prevención y seguimiento personalizado.',
      points: [
        'Realiza actividad física adecuada a tus posibilidades y consulta si tienes dudas.',
        'Revisa periódicamente con un profesional los medicamentos y suplementos que utilizas.',
        'Mantén controles preventivos y busca atención ante cambios repentinos en tu salud.'
      ]
    }
  };
  const productos = {
    medicamentos: {
      title: 'Medicamentos',
      intro: 'Estos productos aparecen en el catálogo de ejemplo. La existencia y los precios se deben confirmar en la botica.',
      image: 'img/medicamentos.jpg',
      items: [
        ['Paracetamol 500 mg tableta'],
        ['Ibuprofeno 400 mg tableta'],
        ['Naproxeno 550 mg tableta'],
        ['Diclofenaco 50 mg tableta'],
        ['Amoxicilina 500 mg cápsula', 'Requiere receta'],
        ['Azitromicina 500 mg tableta', 'Requiere receta'],
        ['Ciprofloxacino 500 mg tableta', 'Requiere receta'],
        ['Antigripal tableta'],
        ['Ambroxol jarabe 15 mg/5 ml'],
        ['Loratadina 10 mg tableta'],
        ['Cetirizina 10 mg tableta'],
        ['Omeprazol 20 mg cápsula'],
        ['Loperamida 2 mg cápsula'],
        ['Sales de rehidratación oral'],
        ['Hioscina 10 mg tableta'],
        ['Clotrimazol crema 1%'],
        ['Hidrocortisona crema 1%', 'Consulta al profesional'],
        ['Metformina 850 mg tableta', 'Requiere receta'],
        ['Losartán 50 mg tableta', 'Requiere receta']
      ]
    },
    vitaminas: {
      title: 'Vitaminas y suplementos',
      intro: 'Estos suplementos figuran en el catálogo de ejemplo. Consulta cuál es adecuado para ti y verifica su disponibilidad.',
      image: 'img/vitaminas.jpg',
      items: [
        ['Vitamina C 500 mg tableta'],
        ['Complejo B tableta'],
        ['Multivitamínico y minerales tableta']
      ]
    },
    'cuidado-personal': {
      title: 'Cuidado personal',
      intro: 'Algunos productos de cuidado personal registrados en el catálogo de ejemplo:',
      image: 'img/cuidado.jpg',
      items: [
        ['Mascarilla quirúrgica'],
        ['Jabón antibacterial 90 g'],
        ['Termómetro digital'],
        ['Crema de óxido de zinc 60 g']
      ]
    },
    formulas: {
      title: 'Fórmulas infantiles',
      intro: 'Por ahora no hay fórmulas infantiles registradas en el catálogo de ejemplo.',
      image: 'img/formulas.jpg',
      emptyMessage: 'Si buscas una fórmula específica, consúltanos por WhatsApp para confirmar si podemos conseguirla. En el catálogo sí figura crema de óxido de zinc para el cuidado de la piel del bebé; consulta su disponibilidad.'
    },
    higiene: {
      title: 'Higiene y primeros auxilios',
      intro: 'Estos artículos aparecen en el catálogo de ejemplo. Confirma existencias antes de acercarte.',
      image: 'img/higiene.jpg',
      items: [
        ['Alcohol medicinal 70° 250 ml'],
        ['Agua oxigenada 120 ml'],
        ['Gasa estéril 10 x 10 cm'],
        ['Apósitos adhesivos (curitas)'],
        ['Algodón hidrófilo 100 g']
      ]
    }
  };
  const modal = document.querySelector('.consejo-modal');
  const productModal = document.querySelector('.producto-modal');
  let triggerToRestore = null;
  let productTriggerToRestore = null;

  function playChime() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      console.warn('Este navegador no permite reproducir el sonido del consejo.');
      return;
    }

    try {
      const audio = new AudioContext();
      [659.25, 880].forEach((frequency, index) => {
        const start = audio.currentTime + index * 0.13;
        const oscillator = audio.createOscillator();
        const volume = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        volume.gain.setValueAtTime(0.0001, start);
        volume.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
        volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        oscillator.connect(volume);
        volume.connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.23);
      });
      window.setTimeout(() => {
        audio.close().catch(error => console.warn('No se pudo cerrar el audio del consejo.', error));
      }, 600);
    } catch (error) {
      console.warn('No se pudo reproducir el sonido del consejo.', error);
    }
  }

  function openAdvice(button) {
    const advice = consejos[button.dataset.consejo];
    if (!advice || !(modal instanceof HTMLDialogElement)) {
      return;
    }

    triggerToRestore = button;
    modal.querySelector('#consejo-modal-titulo').textContent = advice.title;
    modal.querySelector('.consejo-modal-intro').textContent = advice.intro;
    const image = modal.querySelector('.consejo-modal-imagen');
    image.src = button.closest('.consejo').querySelector('img').src;
    image.alt = advice.title;
    const points = modal.querySelector('.consejo-modal-puntos');
    points.replaceChildren(...advice.points.map(text => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));

    modal.showModal();
    playChime();
  }

  document.querySelectorAll('.consejo-leer').forEach(button => {
    button.addEventListener('click', () => openAdvice(button));
  });
  modal.querySelector('.consejo-modal-cerrar').addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      modal.close();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.open) {
      event.preventDefault();
      modal.close();
    }
  });
  modal.addEventListener('close', () => {
    triggerToRestore?.focus();
    triggerToRestore = null;
  });

  function openProductCategory(button) {
    const category = productos[button.dataset.producto];
    if (!category || !(productModal instanceof HTMLDialogElement)) {
      return;
    }

    productTriggerToRestore = button;
    productModal.querySelector('#producto-modal-titulo').textContent = category.title;
    productModal.querySelector('.producto-modal-intro').textContent = category.intro;
    const image = productModal.querySelector('.producto-modal-imagen');
    image.src = category.image;
    image.alt = category.title;
    const list = productModal.querySelector('.producto-modal-lista');
    list.replaceChildren();
    if (category.items) {
      category.items.forEach(([name, note]) => {
        const item = document.createElement('li');
        const productName = document.createElement('span');
        productName.textContent = name;
        item.append(productName);
        if (note) {
          const label = document.createElement('small');
          label.textContent = note;
          item.append(label);
        }
        list.append(item);
      });
    } else {
      const empty = document.createElement('li');
      empty.className = 'producto-modal-vacio';
      empty.textContent = category.emptyMessage;
      list.append(empty);
    }

    productModal.showModal();
    playChime();
  }

  document.querySelectorAll('.producto-abrir').forEach(button => {
    button.addEventListener('click', () => openProductCategory(button));
  });
  productModal.querySelector('.producto-modal-cerrar').addEventListener('click', () => productModal.close());
  productModal.addEventListener('click', event => {
    if (event.target === productModal) {
      productModal.close();
    }
  });
  productModal.addEventListener('close', () => {
    productTriggerToRestore?.focus();
    productTriggerToRestore = null;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && productModal.open) {
      event.preventDefault();
      productModal.close();
    }
  });

  const items = document.querySelectorAll(
    '.landing .titulo, .landing .nosotros .contenedor > *, .landing .ventajas li, .landing .serv, .landing .prod, .landing .consejo, .landing .contacto .info, .landing .mapa, .landing .visitanos'
  );

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    items.forEach(item => item.classList.add('reveal-item', 'is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });

  items.forEach(item => {
    item.classList.add('reveal-item');
    observer.observe(item);
  });
})();
