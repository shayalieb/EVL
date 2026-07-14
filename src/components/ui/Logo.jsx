import logo from '../../assets/logo.svg';

export default function Logo({ className = 'h-8 w-auto' }) {
  return <img src={logo} alt="GigWorks" className={className} />;
}
