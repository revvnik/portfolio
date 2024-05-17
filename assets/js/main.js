(function () {
    "use strict";

    /**
     * Easy selector helper function
     */
    const select = (el, all = false) => {
        el = el.trim();
        if (all) {
            return [...document.querySelectorAll(el)];
        } else {
            return document.querySelector(el);
        }
    };

    /**
     * Easy event listener function
     */
    const on = (type, el, listener, all = false) => {
        let selectEl = select(el, all);
        if (selectEl) {
            if (all) {
                selectEl.forEach((e) => e.addEventListener(type, listener));
            } else {
                selectEl.addEventListener(type, listener);
            }
        }
    };

    /**
     * Easy on scroll event listener
     */
    const onscroll = (el, listener) => {
        el.addEventListener("scroll", listener);
    };

    /**
     * burgerMenu
     */
    const burgerMenu = select(".burger");
    const navbar = select(".sticky-navbar");
    on("click", ".burger", function (e) {
        burgerMenu.classList.toggle("active");
        navbar.classList.toggle("burger-active"); // Toggle the burger-active class on navbar
    });

    /**
     * Testimonials slider
     */
    new Swiper(".testimonials-slider", {
        speed: 600,
        loop: true,
        autoplay: {
            delay: 5000,
            disableOnInteraction: false,
        },
        slidesPerView: "auto",
        pagination: {
            el: ".swiper-pagination",
            type: "bullets",
            clickable: true,
        },
    });

    /**
     * Animation on scroll
     */
    window.addEventListener("load", () => {
        AOS.init({
            duration: 1000,
            easing: "ease-in-out",
            once: true,
            mirror: false,
        });
    });

    window.addEventListener("scroll", function () {
        if (window.scrollY > 0) {
            navbar.classList.add("scrolled");
        } else {
            navbar.classList.remove("scrolled");
        }
    });

    /**
     * Porfolio isotope and filter
     */
    window.addEventListener("load", () => {
        let portfolioContainer = select("#portfolio-grid");
        if (portfolioContainer) {
            let portfolioFilters = select("#filters a", true);

            on(
                "click",
                "#filters a",
                function (e) {
                    portfolioFilters.forEach(function (el) {
                        el.classList.remove("active");
                    });
                    this.classList.add("active");
                },
                true
            );
        }
    });

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("a").forEach((anchor) => {
            anchor.addEventListener("click", function (event) {
                const href = this.getAttribute("href");
                const isInternalLink = this.hostname === window.location.hostname;
                const isFragmentLink = href.startsWith("#");

                if (isFragmentLink && isInternalLink) {
                    // Handle fragment link scrolling
                    event.preventDefault();
                    const targetId = href.substring(1);
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                        targetElement.scrollIntoView();
                        history.pushState(null, "", " ");
                    }
                } else if (isInternalLink) {
                    // Handle other internal links
                    event.preventDefault();
                    window.location.href = href;
                }
                // External links (isInternalLink is false) are not prevented
            });
        });
    });
})();
