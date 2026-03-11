document.addEventListener("DOMContentLoaded", () => {

    // =========================================
    // Scroll Reveal (Intersection Observer)
    // =========================================
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // =========================================
    // Smooth Scrolling
    // =========================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth' });

            // Close mobile nav if open
            const navLinks = document.getElementById('nav-links');
            if (navLinks) navLinks.classList.remove('active');
        });
    });

    // =========================================
    // Navbar scroll effect
    // =========================================
    const navbar = document.getElementById('navbar');
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        if (scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        lastScroll = scrollY;
    }, { passive: true });

    // =========================================
    // Hamburger Menu
    // =========================================
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // =========================================
    // Copy Contract Address
    // =========================================
    const copyBtn = document.getElementById('copy-btn');
    const contractAddress = document.getElementById('contract-address');
    if (copyBtn && contractAddress) {
        copyBtn.addEventListener('click', () => {
            const text = contractAddress.textContent.trim();
            navigator.clipboard.writeText(text).then(() => {
                copyBtn.classList.add('copied');
                const copyText = copyBtn.querySelector('.copy-text');
                if (copyText) copyText.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    if (copyText) copyText.textContent = 'Copy';
                }, 2000);
            }).catch(() => {
                // Fallback
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                copyBtn.classList.add('copied');
                const copyText = copyBtn.querySelector('.copy-text');
                if (copyText) copyText.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    if (copyText) copyText.textContent = 'Copy';
                }, 2000);
            });
        });
    }

    // =========================================
    // Parallax on orbs
    // =========================================
    const orbs = document.querySelectorAll('.orb');
    window.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        orbs.forEach((orb, i) => {
            const speed = (i + 1) * 15;
            orb.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
        });
    }, { passive: true });

    // =========================================
    // Tilt effect on hero logo
    // =========================================
    const logo = document.getElementById('main-logo');
    if (logo) {
        const heroVisual = logo.closest('.hero-visual');
        if (heroVisual) {
            heroVisual.addEventListener('mousemove', (e) => {
                const rect = heroVisual.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width - 0.5;
                const y = (e.clientY - rect.top) / rect.height - 0.5;
                logo.style.transform = `perspective(600px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateY(${Math.sin(Date.now()/800)*10}px)`;
            });
            heroVisual.addEventListener('mouseleave', () => {
                logo.style.transform = '';
            });
        }
    }
});
