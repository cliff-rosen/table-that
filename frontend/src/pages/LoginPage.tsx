import { useLocation } from 'react-router-dom';
import { LoginForm } from '../components/auth';
import PublicTopBar from '../components/layout/PublicTopBar';

export default function LoginPage() {
    const location = useLocation();
    const initialMode = location.pathname === '/register' ? 'register' : 'login';

    return (
        <div className="min-h-screen flex flex-col dark:bg-gray-900 bg-gray-50">
            <PublicTopBar />
            <div className="flex-1 flex items-center justify-center pt-16">
                <LoginForm key={initialMode} initialMode={initialMode} />
            </div>
        </div>
    );
}
