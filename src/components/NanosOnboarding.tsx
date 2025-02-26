'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/hooks/useUser';
import { useSocket } from '@/hooks/useSocket';

// Define available Nanos server versions
const NANOS_VERSIONS = [
  { 
    id: 'standard', 
    name: 'Stable (Recommended)', 
    version: '1.0.12',
    description: 'The latest stable release of Nanos World Server' 
  },
  { 
    id: 'bleeding-edge', 
    name: 'Bleeding Edge', 
    version: '1.1.0-dev',
    description: 'Latest development version with newest features and fixes' 
  }
];

// Installation directory that will be used across the app
export const NANOS_INSTALL_DIR = '/opt/nanos-world-server';

// Default server configuration
const DEFAULT_SERVER_CONFIG = `[discover]
name = "a great server"
description = "nanos made easy"
ip = "0.0.0.0"
port = 7777
query_port = 7778
announce = true
dedicated_server = true

[general]
max_players = 64
password = ""
token = ""
banned_ids = [ ]

[game]
map = "default-blank-map"
game_mode = ""
packages = [ "", ]
assets = [ ]
loading_screen = ""

[custom_settings]

[debug]
log_level = 1
async_log = true
profiling = false

[optimization]
tick_rate = 33
compression = 0`;

// Onboarding steps
enum OnboardingStep {
  WELCOME = 0,
  VERSION_SELECT = 1,
  INSTALLATION = 2,
  VALIDATE = 3,
  COMPLETE = 4
}

export default function NanosOnboarding() {
  const { userData, updateOnboardingStatus } = useUser();
  const { executeCommand } = useSocket();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(OnboardingStep.WELCOME);
  const [selectedVersion, setSelectedVersion] = useState<string>(NANOS_VERSIONS[0].id);
  const [installationProgress, setInstallationProgress] = useState<number>(0);
  const [installationLog, setInstallationLog] = useState<string[]>([]);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  
  // Function to add log message
  const addLogMessage = useCallback((message: string) => {
    setInstallationLog(prev => [...prev, message]);
  }, []);
  
  // Function to handle next step
  const handleNextStep = () => {
    setCurrentStep(prev => {
      const nextStep = prev + 1;
      return nextStep <= OnboardingStep.COMPLETE ? nextStep : prev;
    });
  };
  
  // Function to handle previous step
  const handlePrevStep = () => {
    setCurrentStep(prev => {
      const prevStep = prev - 1;
      return prevStep >= OnboardingStep.WELCOME ? prevStep : prev;
    });
  };
  
  // Function to handle version selection
  const handleVersionSelect = (versionId: string) => {
    setSelectedVersion(versionId);
  };
  
  // Function to start installation
  const handleStartInstallation = async () => {
    setIsInstalling(true);
    addLogMessage('> Starting Nanos World Server installation...');
    addLogMessage(`> Selected version: ${NANOS_VERSIONS.find(v => v.id === selectedVersion)?.name}`);
    
    try {
      setInstallationProgress(10);
      addLogMessage('> Installing lib32gcc-s1...');
      const installLib32 = await executeCommand('sudo apt-get install -y lib32gcc-s1');
      if (installLib32.error) {
        addLogMessage(`Error: ${installLib32.error}`);
        throw new Error(installLib32.error);
      }
      addLogMessage(installLib32.output);

      setInstallationProgress(30);
      addLogMessage('> Creating installation directory...');
      const createDir = await executeCommand(`sudo mkdir -p ${NANOS_INSTALL_DIR}/steam`);
      if (createDir.error) {
        addLogMessage(`Error: ${createDir.error}`);
        throw new Error(createDir.error);
      }
      addLogMessage(createDir.output);

      const setPerms = await executeCommand(`sudo chown -R $USER:$USER ${NANOS_INSTALL_DIR}`);
      if (setPerms.error) {
        addLogMessage(`Error: ${setPerms.error}`);
        throw new Error(setPerms.error);
      }
      addLogMessage(setPerms.output);

      setInstallationProgress(50);
      addLogMessage('> Changing to installation directory...');
      const cdCommand = await executeCommand(`cd ${NANOS_INSTALL_DIR}/steam`);
      if (cdCommand.error) {
        addLogMessage(`Error: ${cdCommand.error}`);
        throw new Error(cdCommand.error);
      }

      addLogMessage('> Downloading and extracting SteamCMD...');
      const downloadSteam = await executeCommand('curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf -');
      if (downloadSteam.error) {
        addLogMessage(`Error: ${downloadSteam.error}`);
        throw new Error(downloadSteam.error);
      }
      addLogMessage(downloadSteam.output);

      setInstallationProgress(70);
      addLogMessage('> Starting SteamCMD download (this may take a while)...');
      
      // Determine the install command based on selected version
      const steamInstallCmd = selectedVersion === 'bleeding-edge' 
        ? `./steamcmd.sh +force_install_dir ${NANOS_INSTALL_DIR} +login anonymous "+app_update 1936830 -beta bleeding-edge" validate +quit`
        : `./steamcmd.sh +force_install_dir ${NANOS_INSTALL_DIR} +login anonymous +app_update 1936830 validate +quit`;
      
      const installServer = await executeCommand(steamInstallCmd);
      if (installServer.error) {
        addLogMessage(`Error during server installation: ${installServer.error}`);
        throw new Error(installServer.error);
      }
      addLogMessage(installServer.output);

      setInstallationProgress(85);
      addLogMessage('> Creating default configuration file...');
      // Create Config.toml with default configuration
      const createConfig = await executeCommand(`echo '${DEFAULT_SERVER_CONFIG}' > ${NANOS_INSTALL_DIR}/Config.toml`);
      if (createConfig.error) {
        addLogMessage(`Error creating configuration file: ${createConfig.error}`);
        throw new Error(createConfig.error);
      }
      addLogMessage('> Configuration file created successfully');

      setInstallationProgress(90);
      addLogMessage('> Setting up permissions...');
      const makeExecutable = await executeCommand(`chmod +x ${NANOS_INSTALL_DIR}/NanosWorldServer.sh`);
      if (makeExecutable.error) {
        addLogMessage(`Error: ${makeExecutable.error}`);
        throw new Error(makeExecutable.error);
      }
      addLogMessage(makeExecutable.output);

      setInstallationProgress(100);
      addLogMessage('> Installation complete!');
      addLogMessage(`> Server installed at: ${NANOS_INSTALL_DIR}`);
      addLogMessage('> You can now proceed with server configuration.');
      
    } catch (error) {
      addLogMessage(`> Error: ${(error as Error).message}`);
      // Keep progress where it failed
    } finally {
      setIsInstalling(false);
    }
  };
  
  // Function to handle configuration changes
  const handleConfigChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    // Configuration will be handled in the dashboard
  };
  
  // Function to load initial config values
  const loadConfigValues = useCallback(async () => {
    // Configuration will be handled in the dashboard
  }, []);

  // Load config values when reaching configuration step
  useEffect(() => {
    // Configuration will be handled in the dashboard
  }, []);
  
  // Function to complete onboarding
  const handleCompleteOnboarding = async () => {
    await updateOnboardingStatus(true);
    // Navigate to dashboard or reload page
    window.location.reload();
  };
  
  // Function to validate installation
  const validateInstallation = async () => {
    addLogMessage('> Validating installation...');
    
    try {
      // Check if server executable exists
      const checkExecutable = await executeCommand(`test -f ${NANOS_INSTALL_DIR}/NanosWorldServer.sh && echo "Found" || echo "Not found"`);
      if (checkExecutable.output.trim() !== "Found") {
        throw new Error("Server executable not found");
      }
      addLogMessage('✓ Server executable found');

      // Check if config file exists
      const checkConfig = await executeCommand(`test -f ${NANOS_INSTALL_DIR}/Config.toml && echo "Found" || echo "Not found"`);
      if (checkConfig.output.trim() !== "Found") {
        throw new Error("Configuration file not found");
      }
      addLogMessage('✓ Configuration file found');
      addLogMessage('> All validation checks passed successfully!');
      addLogMessage('> You can configure your server later from the dashboard.');
      handleNextStep();
    } catch (error) {
      addLogMessage(`✗ Validation failed: ${(error as Error).message}`);
      addLogMessage('> Please try reinstalling the server');
    }
  };
  
  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case OnboardingStep.WELCOME:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Welcome to Nanos World Server Manager</h3>
            <p className="text-gray-300">
              This wizard will guide you through the process of setting up your Nanos World Server.
              Follow the steps to install and configure your server.
            </p>
            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={handleNextStep}
                className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono"
              >
                Next Step &gt;
              </button>
            </div>
          </div>
        );
        
      case OnboardingStep.VERSION_SELECT:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Select Nanos World Server Version</h3>
            <p className="text-gray-300 mb-4">
              Choose the version of Nanos World Server you want to install:
            </p>
            
            <div className="space-y-3">
              {NANOS_VERSIONS.map(version => (
                <button
                  type="button"
                  key={version.id}
                  onClick={() => handleVersionSelect(version.id)}
                  className={`w-full p-4 rounded-lg cursor-pointer transition-all text-left ${
                    selectedVersion === version.id
                      ? 'bg-amber-500/30 border border-amber-500/50'
                      : 'bg-black/30 border border-amber-500/10 hover:bg-black/40'
                  }`}
                >
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-full mr-3 ${
                      selectedVersion === version.id ? 'bg-amber-400' : 'bg-gray-600'
                    }`} />
                    <div>
                      <div className="font-mono text-amber-300">{version.name} <span className="text-xs text-amber-500/70">v{version.version}</span></div>
                      <div className="text-sm text-gray-400">{version.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-4 py-2 bg-gray-800/50 text-gray-300 rounded hover:bg-gray-800/70 transition-colors font-mono"
              >
                &lt; Back
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono"
              >
                Next Step &gt;
              </button>
            </div>
          </div>
        );
        
      case OnboardingStep.INSTALLATION:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Installing Nanos World Server</h3>
            
            <div className="bg-black/50 p-4 rounded-lg border border-amber-500/10 font-mono text-sm">
              <div className="h-64 overflow-y-auto space-y-1 mb-4">
                {installationLog.map((log, index) => (
                  <div key={`log-${index}-${log.slice(0, 10)}`} className="text-gray-300">{log}</div>
                ))}
                {isInstalling && (
                  <div className="text-amber-400 animate-pulse">_</div>
                )}
              </div>
              
              <div className="w-full bg-gray-800 rounded-full h-2.5">
                <div 
                  className="bg-amber-500 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${installationProgress}%` }}
                />
              </div>
              <div className="text-right text-xs text-gray-400 mt-1">
                {installationProgress}% Complete
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={isInstalling}
                className="px-4 py-2 bg-gray-800/50 text-gray-300 rounded hover:bg-gray-800/70 transition-colors font-mono disabled:opacity-50"
              >
                &lt; Back
              </button>
              
              {installationProgress < 100 ? (
                <button
                  type="button"
                  onClick={handleStartInstallation}
                  disabled={isInstalling}
                  className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono disabled:opacity-50"
                >
                  {isInstalling ? 'Installing...' : 'Start Installation'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono"
                >
                  Next Step &gt;
                </button>
              )}
            </div>
          </div>
        );
        
      case OnboardingStep.VALIDATE:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Validating Installation</h3>
            
            <div className="bg-black/50 p-4 rounded-lg border border-amber-500/10 font-mono text-sm">
              <div className="h-64 overflow-y-auto space-y-1 mb-4">
                {installationLog.map((log, index) => (
                  <div key={`log-${index}-${log.slice(0, 10)}`} className="text-gray-300">{log}</div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-4 py-2 bg-gray-800/50 text-gray-300 rounded hover:bg-gray-800/70 transition-colors font-mono"
              >
                &lt; Back
              </button>
              <button
                type="button"
                onClick={validateInstallation}
                className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono"
              >
                Validate Installation
              </button>
            </div>
          </div>
        );
        
      case OnboardingStep.COMPLETE:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Setup Complete!</h3>
            <p className="text-gray-300">
              Congratulations! Your Nanos World Server has been successfully installed and validated.
              You can now start managing your server from the dashboard.
            </p>
            
            <div className="p-4 bg-green-900/20 border border-green-500/20 rounded-lg mt-4">
              <h4 className="font-mono text-green-400 flex items-center">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-5 w-5 mr-2" 
                  viewBox="0 0 20 20" 
                  fill="currentColor" 
                  role="img"
                  aria-labelledby="installationSummaryTitle"
                >
                  <title id="installationSummaryTitle">Installation completed successfully</title>
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Installation Summary
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-gray-300">
                <li>• Server Version: {NANOS_VERSIONS.find(v => v.id === selectedVersion)?.name} (v{NANOS_VERSIONS.find(v => v.id === selectedVersion)?.version})</li>
                <li>• Installation Directory: {NANOS_INSTALL_DIR}</li>
              </ul>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-4 py-2 bg-gray-800/50 text-gray-300 rounded hover:bg-gray-800/70 transition-colors font-mono"
              >
                &lt; Back
              </button>
              <button
                type="button"
                onClick={handleCompleteOnboarding}
                className="px-4 py-2 bg-green-600/50 text-green-300 rounded hover:bg-green-600/70 transition-colors font-mono"
              >
                Complete Setup
              </button>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  // Progress indicator
  const renderProgressIndicator = () => {
    const steps = [
      { name: 'Welcome', step: OnboardingStep.WELCOME },
      { name: 'Version', step: OnboardingStep.VERSION_SELECT },
      { name: 'Install', step: OnboardingStep.INSTALLATION },
      { name: 'Validate', step: OnboardingStep.VALIDATE },
      { name: 'Complete', step: OnboardingStep.COMPLETE }
    ];
    
    return (
      <div className="flex justify-between mb-8">
        {steps.map((step) => (
          <div key={`step-${step.step}`} className="flex flex-col items-center">
            <div 
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= step.step 
                  ? 'bg-amber-500/50 text-amber-200' 
                  : 'bg-gray-800/50 text-gray-500'
              }`}
            >
              {step.step + 1}
            </div>
            <div className={`text-xs mt-1 font-mono ${
              currentStep >= step.step ? 'text-amber-400' : 'text-gray-500'
            }`}>
              {step.name}
            </div>
            {step.step < steps.length - 1 && (
              <div className="absolute w-[calc(20%-2rem)] h-0.5 mt-4 ml-8" style={{ left: `${step.step * 20}%` }}>
                <div className={`h-full ${
                  currentStep > step.step ? 'bg-amber-500/30' : 'bg-gray-800/50'
                }`} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="backdrop-blur-sm backdrop-filter bg-black/40 p-6 rounded-xl shadow-xl border border-amber-500/20 transition-all duration-300 hover:bg-black/50">
      {renderProgressIndicator()}
      {renderStep()}
    </div>
  );
}