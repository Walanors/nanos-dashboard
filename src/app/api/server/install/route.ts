import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { version } = await request.json();
    
    // Validate version
    if (version !== 'standard' && version !== 'bleeding-edge') {
      return NextResponse.json(
        { error: 'Invalid version. Must be "standard" or "bleeding-edge"' },
        { status: 400 }
      );
    }

    // Install required dependencies
    await execAsync('sudo add-apt-repository multiverse -y');
    await execAsync('sudo dpkg --add-architecture i386');
    await execAsync('sudo apt update');
    await execAsync('sudo apt install -y lib32gcc1 steamcmd');

    // Create installation directory
    const installDir = '/opt/nanos-world-server';
    await execAsync(`sudo mkdir -p ${installDir}`);
    await execAsync(`sudo chown -R $USER:$USER ${installDir}`);

    // Prepare SteamCMD command
    const steamCmd = version === 'standard' 
      ? `steamcmd +force_install_dir ${installDir} +login anonymous +app_update 1936830 validate +quit`
      : `steamcmd +force_install_dir ${installDir} +login anonymous +app_update "1936830 -beta bleeding-edge" validate +quit`;

    // Execute SteamCMD command
    const { stdout, stderr } = await execAsync(steamCmd);

    // Make server script executable
    await execAsync(`chmod +x ${installDir}/NanosWorldServer.sh`);

    return NextResponse.json({
      success: true,
      message: 'Server installation completed',
      output: stdout,
      error: stderr || null,
      installPath: installDir
    });

  } catch (error) {
    console.error('Server installation error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
} 