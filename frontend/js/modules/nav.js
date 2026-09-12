class Nav {
    constructor() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                window.navigate(item.dataset.page);
                if (window.innerWidth <= 768) {
                    document.getElementById('sidebar').classList.add('closed');
                }
            });
        });
    }
}
export default Nav;
