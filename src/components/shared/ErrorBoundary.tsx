import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { LanguageContext } from '../../contexts/LanguageContext';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('❌ ErrorBoundary caught an error:', error);
    console.error('Component Stack:', errorInfo.componentStack);

    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <LanguageContext.Consumer>
          {(context) => {
            const t = context?.t || {
              anErrorOccurred: 'Bir Hata Oluştu',
              unexpectedErrorEncountered: 'Beklenmedik bir hata ile karşılaşıldı.',
              errorMessage: 'Hata Mesajı',
              technicalDetailsForDevelopers: 'Geliştiriciler için teknik detaylar',
              refreshPage: 'Sayfayı Yenile',
              goBack: 'Geri Dön',
              helpMessage: 'Sorun devam ederse lütfen sistem yöneticinizle iletişime geçin.'
            };

            return (
              <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100 p-4">
                <div className="max-w-2xl w-full bg-white rounded-xl shadow-2xl p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h1 className="text-2xl text-gray-900">{t.anErrorOccurred}</h1>
                      <p className="text-sm text-gray-600">{t.unexpectedErrorEncountered}</p>
                    </div>
                  </div>

                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-900 mb-2">
                      <strong>{t.errorMessage}:</strong>
                    </p>
                    <p className="text-sm text-red-800 font-mono">
                      {this.state.error?.toString()}
                    </p>
                  </div>

                  {this.state.errorInfo && (
                    <details className="mb-6">
                      <summary className="text-sm cursor-pointer text-gray-700 hover:text-gray-900 mb-2">
                        {t.technicalDetailsForDevelopers}
                      </summary>
                      <div className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-lg max-h-64 overflow-auto">
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    </details>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={this.handleReset}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {t.refreshPage}
                    </button>
                    <button
                      onClick={() => window.history.back()}
                      className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      {t.goBack}
                    </button>
                  </div>

                  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900">
                      {t.helpMessage}
                    </p>
                  </div>
                </div>
              </div>
            );
          }}
        </LanguageContext.Consumer>
      );
    }

    return this.props.children;
  }
}

