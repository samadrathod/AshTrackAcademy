/**
 * AshTrack Academy - Micro-interactions and Scroll Animations
 * Handcrafted vanilla JavaScript with performance and accessibility in mind.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Scroll Reveal with Intersection Observer
    const revealCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Add visible class to trigger CSS transition
                entry.target.classList.add('reveal-visible');
                // Stop observing once the animation triggers
                observer.unobserve(entry.target);
            }
        });
    };

    const revealObserver = new IntersectionObserver(revealCallback, {
        threshold: 0.05, // trigger when 5% of the element is visible
        rootMargin: '0px 0px -40px 0px' // offset to prevent early triggers on scroll
    });

    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    revealElements.forEach(el => {
        revealObserver.observe(el);
        
        // Dynamically assign CSS variable index to staggered items
        const staggerItems = el.querySelectorAll('.reveal-stagger-item');
        staggerItems.forEach((item, index) => {
            item.style.setProperty('--index', index);
        });
    });

    // 2. Number Counter Animation on Scroll
    const countUpCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const countTo = parseFloat(target.getAttribute('data-count'));
                const duration = parseInt(target.getAttribute('data-duration') || '1200', 10);
                const start = parseFloat(target.getAttribute('data-start') || '0');
                
                let startTime = null;

                const animateCount = (timestamp) => {
                    if (!startTime) startTime = timestamp;
                    const progress = Math.min((timestamp - startTime) / duration, 1);
                    const currentCount = progress * (countTo - start) + start;
                    
                    // Format correctly as integer or decimal
                    if (Number.isInteger(countTo)) {
                        const origText = target.getAttribute('data-count-text') || countTo.toString();
                        const isZeroPrefixed = origText.startsWith('0') && countTo < 10;
                        let valStr = Math.floor(currentCount).toString();
                        
                        // Preserve leading zero if it was there originally (like 01, 02)
                        if (isZeroPrefixed && valStr.length === 1) {
                            valStr = '0' + valStr;
                        }
                        target.textContent = valStr;
                    } else {
                        target.textContent = currentCount.toFixed(1);
                    }

                    if (progress < 1) {
                        requestAnimationFrame(animateCount);
                    } else {
                        // Ensure it sets exactly the final text
                        target.textContent = target.getAttribute('data-count-text') || countTo.toString();
                    }
                };

                requestAnimationFrame(animateCount);
                observer.unobserve(target);
            }
        });
    };

    const countObserver = new IntersectionObserver(countUpCallback, {
        threshold: 0.1
    });

    const countElements = document.querySelectorAll('.count-up');
    countElements.forEach(el => {
        // Save initial text and convert to number
        const text = el.textContent.trim();
        const numVal = parseFloat(text);
        if (!isNaN(numVal)) {
            el.setAttribute('data-count', numVal);
            el.setAttribute('data-count-text', text);
            el.textContent = el.getAttribute('data-start') || '0';
            countObserver.observe(el);
        }
    });
});
