import Swiper from '../../node_modules/swiper';
// import Swiper styles
import 'swiper/css';

var swiper = new Swiper(".snapslider-overflow", {
    cssMode: true,
    speed: 1000,
    navigation: {
      nextEl: ".swiper-button-next",
      prevEl: ".swiper-button-prev"
    },
    //wrapperClass: "snapslider-scroll",
    //slideClass: "snapslider-card",
    slidesPerView: "auto",
    mousewheel: true,
    keyboard: true,
});