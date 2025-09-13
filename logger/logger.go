package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/fatih/color"
)

type Config struct {
	Level       string
	Console     bool
	File        string
	Colors      bool
	Timestamp   bool
	MaxFileSize int64
}

type Logger struct {
	config Config
	file   *os.File
}

// New 创建 Logger
func New(config Config) (*Logger, error) {
	l := &Logger{config: config}
	if config.File != "" {
		if err := os.MkdirAll(filepath.Dir(config.File), 0755); err != nil {
			return nil, err
		}
		file, err := os.OpenFile(config.File, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return nil, err
		}
		l.file = file
	}
	return l, nil
}

func (l *Logger) Close() {
	if l.file != nil {
		l.file.Close()
	}
}

func (l *Logger) Log(level string, msg string) {
	if l.config.Level != "debug" && level == "debug" {
		return
	}
	timestamp := ""
	if l.config.Timestamp {
		timestamp = time.Now().Format("2006-01-02 15:04:05") + " "
	}
	logLine := fmt.Sprintf("%s%s %s", timestamp, level, msg)
	if l.config.Console {
		if l.config.Colors {
			switch level {
			case "INFO":
				color.Cyan(logLine)
			case "WARN":
				color.Yellow(logLine)
			case "ERROR":
				color.Red(logLine)
			default:
				fmt.Println(logLine)
			}
		} else {
			fmt.Println(logLine)
		}
	}
	if l.file != nil {
		l.file.WriteString(logLine + "\n")
	}
}
