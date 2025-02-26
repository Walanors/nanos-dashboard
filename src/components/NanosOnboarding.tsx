'use client';

import { useState, useEffect } from 'react';
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

// Onboarding steps
enum OnboardingStep {
  WELCOME = 0,
  VERSION_SELECT = 1,
  INSTALLATION = 2,
  CONFIGURATION = 3,
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
  const [serverConfig, setServerConfig] = useState({
    serverName: 'My Nanos Server',
    maxPlayers: 32,
    port: 7777,
    queryPort: 7778
  });
  
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
      addLogMessage('> Adding multiverse repository...');
      const addRepo = await executeCommand('sudo add-apt-repository multiverse -y');
      if (addRepo.error) throw new Error(addRepo.error);

      setInstallationProgress(20);
      addLogMessage('> Adding i386 architecture...');
      const addArch = await executeCommand('sudo dpkg --add-architecture i386');
      if (addArch.error) throw new Error(addArch.error);

      setInstallationProgress(30);
      addLogMessage('> Updating package lists...');
      const aptUpdate = await executeCommand('sudo apt update');
      if (aptUpdate.error) throw new Error(aptUpdate.error);

      setInstallationProgress(40);
      addLogMessage('> Installing required dependencies...');
      const installDeps = await executeCommand('sudo apt install -y lib32gcc-s1 steamcmd');
      if (installDeps.error) throw new Error(installDeps.error);

      setInstallationProgress(50);
      addLogMessage('> Creating installation directory...');
      const installDir = '/opt/nanos-world-server';
      const createDir = await executeCommand(`sudo mkdir -p ${installDir}`);
      if (createDir.error) throw new Error(createDir.error);

      const setPerms = await executeCommand(`sudo chown -R $USER:$USER ${installDir}`);
      if (setPerms.error) throw new Error(setPerms.error);

      setInstallationProgress(60);
      addLogMessage('> Downloading Nanos World Server...');
      // Prepare SteamCMD command based on version
      const steamCmd = selectedVersion === 'standard' 
        ? `steamcmd +force_install_dir ${installDir} +login anonymous +app_update 1936830 validate +quit`
        : `steamcmd +force_install_dir ${installDir} +login anonymous +app_update "1936830 -beta bleeding-edge" validate +quit`;
      
      const installServer = await executeCommand(steamCmd);
      if (installServer.error) throw new Error(installServer.error);

      setInstallationProgress(90);
      addLogMessage('> Setting up permissions...');
      const makeExecutable = await executeCommand(`chmod +x ${installDir}/NanosWorldServer.sh`);
      if (makeExecutable.error) throw new Error(makeExecutable.error);

      setInstallationProgress(100);
      addLogMessage('> Installation complete!');
      addLogMessage(`> Server installed at: ${installDir}`);
      addLogMessage('> You can now proceed with server configuration.');
      
    } catch (error) {
      addLogMessage(`> Error: ${(error as Error).message}`);
      // Keep progress where it failed
    } finally {
      setIsInstalling(false);
    }
  };
  
  // Function to add log message
  const addLogMessage = (message: string) => {
    setInstallationLog(prev => [...prev, message]);
  };
  
  // Function to handle configuration changes
  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setServerConfig(prev => ({
      ...prev,
      [name]: name === 'maxPlayers' || name === 'port' || name === 'queryPort' 
        ? parseInt(value, 10) || 0 
        : value
    }));
  };
  
  // Function to complete onboarding
  const handleCompleteOnboarding = async () => {
    await updateOnboardingStatus(true);
    // Navigate to dashboard or reload page
    window.location.reload();
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
                <div
                  key={version.id}
                  onClick={() => handleVersionSelect(version.id)}
                  className={`p-4 rounded-lg cursor-pointer transition-all ${
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
                </div>
              ))}
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                onClick={handlePrevStep}
                className="px-4 py-2 bg-gray-800/50 text-gray-300 rounded hover:bg-gray-800/70 transition-colors font-mono"
              >
                &lt; Back
              </button>
              <button
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
                  <div key={index} className="text-gray-300">{log}</div>
                ))}
                {isInstalling && (
                  <div className="text-amber-400 animate-pulse">_</div>
                )}
              </div>
              
              <div className="w-full bg-gray-800 rounded-full h-2.5">
                <div 
                  className="bg-amber-500 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${installationProgress}%` }}
                ></div>
              </div>
              <div className="text-right text-xs text-gray-400 mt-1">
                {installationProgress}% Complete
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                onClick={handlePrevStep}
                disabled={isInstalling}
                className="px-4 py-2 bg-gray-800/50 text-gray-300 rounded hover:bg-gray-800/70 transition-colors font-mono disabled:opacity-50"
              >
                &lt; Back
              </button>
              
              {installationProgress < 100 ? (
                <button
                  onClick={handleStartInstallation}
                  disabled={isInstalling}
                  className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono disabled:opacity-50"
                >
                  {isInstalling ? 'Installing...' : 'Start Installation'}
                </button>
              ) : (
                <button
                  onClick={handleNextStep}
                  className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono"
                >
                  Next Step &gt;
                </button>
              )}
            </div>
          </div>
        );
        
      case OnboardingStep.CONFIGURATION:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Configure Your Server</h3>
            <p className="text-gray-300 mb-4">
              Set up the basic configuration for your Nanos World Server:
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-gray-300 font-mono text-sm">Server Name</label>
                <input
                  type="text"
                  name="serverName"
                  value={serverConfig.serverName}
                  onChange={handleConfigChange}
                  className="w-full bg-black/30 border border-amber-500/20 rounded p-2 text-gray-200 font-mono focus:outline-none focus:border-amber-500/50"
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-gray-300 font-mono text-sm">Max Players</label>
                <input
                  type="number"
                  name="maxPlayers"
                  value={serverConfig.maxPlayers}
                  onChange={handleConfigChange}
                  min="1"
                  max="100"
                  className="w-full bg-black/30 border border-amber-500/20 rounded p-2 text-gray-200 font-mono focus:outline-none focus:border-amber-500/50"
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-gray-300 font-mono text-sm">Game Port</label>
                <input
                  type="number"
                  name="port"
                  value={serverConfig.port}
                  onChange={handleConfigChange}
                  min="1024"
                  max="65535"
                  className="w-full bg-black/30 border border-amber-500/20 rounded p-2 text-gray-200 font-mono focus:outline-none focus:border-amber-500/50"
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-gray-300 font-mono text-sm">Query Port</label>
                <input
                  type="number"
                  name="queryPort"
                  value={serverConfig.queryPort}
                  onChange={handleConfigChange}
                  min="1024"
                  max="65535"
                  className="w-full bg-black/30 border border-amber-500/20 rounded p-2 text-gray-200 font-mono focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-black/20 rounded border border-amber-500/10">
              <h4 className="text-sm font-mono text-amber-300 mb-2">Server Configuration Preview:</h4>
              <pre className="text-xs text-gray-300 font-mono overflow-x-auto">
{`{
  "server_name": "${serverConfig.serverName}",
  "max_players": ${serverConfig.maxPlayers},
  "port": ${serverConfig.port},
  "query_port": ${serverConfig.queryPort},
  "log_level": "info",
  "packages": ["sandbox"]
}`}
              </pre>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                onClick={handlePrevStep}
                className="px-4 py-2 bg-gray-800/50 text-gray-300 rounded hover:bg-gray-800/70 transition-colors font-mono"
              >
                &lt; Back
              </button>
              <button
                onClick={handleNextStep}
                className="px-4 py-2 bg-amber-500/30 text-amber-300 rounded hover:bg-amber-500/40 transition-colors font-mono"
              >
                Next Step &gt;
              </button>
            </div>
          </div>
        );
        
      case OnboardingStep.COMPLETE:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-amber-300 font-mono">Setup Complete!</h3>
            <p className="text-gray-300">
              Congratulations! Your Nanos World Server has been successfully installed and configured.
              You can now start managing your server from the dashboard.
            </p>
            
            <div className="p-4 bg-green-900/20 border border-green-500/20 rounded-lg mt-4">
              <h4 className="font-mono text-green-400 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Installation Summary
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-gray-300">
                <li>• Server Version: {NANOS_VERSIONS.find(v => v.id === selectedVersion)?.name} (v{NANOS_VERSIONS.find(v => v.id === selectedVersion)?.version})</li>
                <li>• Server Name: {serverConfig.serverName}</li>
                <li>• Max Players: {serverConfig.maxPlayers}</li>
                <li>• Game Port: {serverConfig.port}</li>
                <li>• Query Port: {serverConfig.queryPort}</li>
              </ul>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                onClick={handlePrevStep}
                className="px-4 py-2 bg-gray-800/50 text-gray-300 rounded hover:bg-gray-800/70 transition-colors font-mono"
              >
                &lt; Back
              </button>
              <button
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
      { name: 'Configure', step: OnboardingStep.CONFIGURATION },
      { name: 'Complete', step: OnboardingStep.COMPLETE }
    ];
    
    return (
      <div className="flex justify-between mb-8">
        {steps.map((step, index) => (
          <div key={index} className="flex flex-col items-center">
            <div 
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= step.step 
                  ? 'bg-amber-500/50 text-amber-200' 
                  : 'bg-gray-800/50 text-gray-500'
              }`}
            >
              {index + 1}
            </div>
            <div className={`text-xs mt-1 font-mono ${
              currentStep >= step.step ? 'text-amber-400' : 'text-gray-500'
            }`}>
              {step.name}
            </div>
            {index < steps.length - 1 && (
              <div className="absolute w-[calc(20%-2rem)] h-0.5 mt-4 ml-8" style={{ left: `${index * 20}%` }}>
                <div className={`h-full ${
                  currentStep > step.step ? 'bg-amber-500/30' : 'bg-gray-800/50'
                }`}></div>
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
