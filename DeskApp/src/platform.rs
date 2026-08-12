use std::process::Command;

pub trait PlatformCommandExt {
    fn platform_no_window(&mut self) -> &mut Self;
}

#[cfg(windows)]
impl PlatformCommandExt for Command {
    fn platform_no_window(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt;
        self.creation_flags(0x0800_0000)
    }
}

#[cfg(not(windows))]
impl PlatformCommandExt for Command {
    fn platform_no_window(&mut self) -> &mut Self {
        self
    }
}
