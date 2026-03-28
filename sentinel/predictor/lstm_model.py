import torch, torch.nn as nn, numpy as np

class LSTMForecaster(nn.Module):
    def __init__(self, input_size=1, hidden_size=64, num_layers=2, output_size=60):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, dropout=0.2)
        self.fc = nn.Linear(hidden_size, output_size)
    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])

def prepare_sequence(values, seq_len=120):
    v = np.array(values[-seq_len:], dtype=np.float32)
    if len(v) < seq_len:
        v = np.pad(v, (seq_len - len(v), 0))
    mean, std = v.mean(), v.std() + 1e-8
    v_norm = (v - mean) / std
    tensor = torch.FloatTensor(v_norm).unsqueeze(0).unsqueeze(-1)
    return tensor, mean, std

def train_model(values, epochs=50):
    model = LSTMForecaster()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.MSELoss()
    seq_len, pred_len = 120, 60
    X, y = [], []
    for i in range(len(values) - seq_len - pred_len):
        X.append(values[i:i+seq_len])
        y.append(values[i+seq_len:i+seq_len+pred_len])
    if len(X) < 5:
        print('Not enough data to train — need 30min of baseline')
        return model
    X = torch.FloatTensor(np.array(X)).unsqueeze(-1)
    y = torch.FloatTensor(np.array(y))
    mean, std = X.mean(), X.std() + 1e-8
    X = (X - mean) / std
    y = (y - mean) / std
    model.train()
    for epoch in range(epochs):
        optimizer.zero_grad()
        loss = criterion(model(X), y)
        loss.backward()
        optimizer.step()
        if epoch % 10 == 0:
            print(f'Epoch {epoch}/{epochs}  loss={loss.item():.6f}')
    model.eval()
    return model, mean.item(), std.item()