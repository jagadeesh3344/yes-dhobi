import React, { useState } from 'react';
import { useRegistrationStore } from './hooks/useRegistrationStore';
import { Header } from './components/Header';
import { Stepper } from './components/Stepper';
import { SidebarInfo } from './components/SidebarInfo';
import { Step1PersonalDetails } from './components/steps/Step1PersonalDetails';
import { Step2BusinessDetails } from './components/steps/Step2BusinessDetails';
import { Step3ServicePricing } from './components/steps/Step3ServicePricing';
import { Step4Location } from './components/steps/Step4Location';
import { Step5DocumentsVerification } from './components/steps/Step5DocumentsVerification';
import { SuccessScreen } from './components/steps/SuccessScreen';
import { LandingPage } from './components/LandingPage';
import { Footer } from './components/Footer';

export function App() {
  const {
    currentStep,
    setCurrentStep,
    formData,
    updateFormData,
    updateServicePrice,
    toggleService,
    resetForm
  } = useRegistrationStore();

  const [viewMode, setViewMode] = useState<'landing' | 'registration'>('registration');

  const handleStartRegistration = () => {
    setViewMode('registration');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateHome = () => {
    setViewMode('landing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (viewMode === 'landing') {
    return <LandingPage onStartRegistration={handleStartRegistration} />;
  }

  return (
    <div className="w-full min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-slate-900">
      {/* App Header */}
      <Header
        currentStep={currentStep}
        onNavigateHome={handleNavigateHome}
        onNavigateRegister={handleStartRegistration}
      />

      {/* Main Registration Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {currentStep === 'success' ? (
          <SuccessScreen
            formData={formData}
            onReset={() => {
              resetForm();
              setViewMode('landing');
            }}
          />
        ) : (
          <div className="w-full">
            {/* Top Stepper Indicator */}
            <Stepper
              currentStep={currentStep}
              onStepClick={(step) => setCurrentStep(step as any)}
            />

            {/* 2-Column Responsive Layout Shell: Left Info Sidebar + Right Active Step Form */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* Left Informational Sidebar */}
              <SidebarInfo currentStep={currentStep} />

              {/* Right Form Card */}
              <div className="flex-1 w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8">
                {currentStep === 1 && (
                  <Step1PersonalDetails
                    formData={formData}
                    updateFormData={updateFormData}
                    onNext={() => {
                      setCurrentStep(2);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                )}

                {currentStep === 2 && (
                  <Step2BusinessDetails
                    formData={formData}
                    updateFormData={updateFormData}
                    onNext={() => {
                      setCurrentStep(3);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onBack={() => {
                      setCurrentStep(1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                )}

                {currentStep === 3 && (
                  <Step3ServicePricing
                    formData={formData}
                    toggleService={toggleService}
                    updateServicePrice={updateServicePrice}
                    updateFormData={updateFormData}
                    onNext={() => {
                      setCurrentStep(4);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onBack={() => {
                      setCurrentStep(2);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                )}

                {currentStep === 4 && (
                  <Step4Location
                    formData={formData}
                    updateFormData={updateFormData}
                    onNext={() => {
                      setCurrentStep(5);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onBack={() => {
                      setCurrentStep(3);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                )}

                {currentStep === 5 && (
                  <Step5DocumentsVerification
                    formData={formData}
                    updateFormData={updateFormData}
                    onSubmitSuccess={() => {
                      setCurrentStep('success');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onBack={() => {
                      setCurrentStep(4);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default App;
